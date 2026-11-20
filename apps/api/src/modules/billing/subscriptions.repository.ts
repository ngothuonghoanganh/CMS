import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { BillingCycle, SubscriptionFacts } from '@plp/contracts';
import { type Model, Types } from 'mongoose';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import type { WorkspaceRef } from '../../shared/persistence/workspace-databases.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { SUBSCRIPTION_MODEL, type SubscriptionRecord } from './subscription.schema.js';

/** The stored form of new facts at `at`: the open invoice as an ObjectId. */
function newRecordFields(facts: SubscriptionFacts, at: Date): Omit<SubscriptionRecord, '_id'> {
  return {
    ...facts,
    openInvoiceId: facts.openInvoiceId === null ? null : new Types.ObjectId(facts.openInvoiceId),
    createdAt: at,
    updatedAt: at,
  };
}

function toFacts(record: SubscriptionRecord): SubscriptionFacts {
  return {
    planId: record.planId,
    cycle: record.cycle,
    trialEndsAt: record.trialEndsAt,
    periodStart: record.periodStart,
    periodEnd: record.periodEnd,
    cancelAtPeriodEnd: record.cancelAtPeriodEnd,
    scheduledChange: record.scheduledChange
      ? { planId: record.scheduledChange.planId, cycle: record.scheduledChange.cycle }
      : null,
    openInvoiceId: record.openInvoiceId?.toHexString() ?? null,
    failedSince: record.failedSince,
    paymentMethod: record.paymentMethod
      ? {
          token: record.paymentMethod.token,
          brand: record.paymentMethod.brand,
          last4: record.paymentMethod.last4,
          expMonth: record.paymentMethod.expMonth,
          expYear: record.paymentMethod.expYear,
        }
      : null,
    billingInfo: record.billingInfo
      ? {
          companyName: record.billingInfo.companyName,
          taxCode: record.billingInfo.taxCode,
          address: record.billingInfo.address,
          email: record.billingInfo.email,
        }
      : null,
    nextActionAt: record.nextActionAt,
    lockedUntil: record.lockedUntil,
    version: record.version,
  };
}

/**
 * The subscriptions of the master DB (ADR-035), one per workspace with its id as `_id`. The
 * workspace comes from a scope, or from the master's own records (the list of workspaces).
 */
@Injectable()
export class SubscriptionsRepository {
  constructor(
    @InjectModel(SUBSCRIPTION_MODEL) private readonly subscriptions: Model<SubscriptionRecord>,
  ) {}

  /** The first subscription of a new workspace, in the transaction that creates it. */
  async create(workspaceId: ObjectId, facts: SubscriptionFacts, at: Date, tx: Tx): Promise<void> {
    await this.subscriptions.create([{ _id: workspaceId, ...newRecordFields(facts, at) }], {
      session: tx,
    });
  }

  /** The facts of the workspace's subscription; null when it has none. */
  async find(ref: WorkspaceRef, tx?: Tx): Promise<SubscriptionFacts | null> {
    const record = await this.subscriptions
      .findById(ref.workspaceId)
      .session(tx ?? null)
      .lean<SubscriptionRecord>()
      .exec();
    return record ? toFacts(record) : null;
  }

  /**
   * Gives `facts` to each of `workspaceIds` without a subscription, and leaves the others alone;
   * how many it gave. One upsert per workspace on `_id`, so several instances may run it at once.
   */
  async createMissing(
    workspaceIds: readonly ObjectId[],
    facts: SubscriptionFacts,
    at: Date,
  ): Promise<number> {
    if (workspaceIds.length === 0) {
      return 0;
    }
    const result = await this.subscriptions.bulkWrite(
      workspaceIds.map((workspaceId) => ({
        updateOne: {
          filter: { _id: workspaceId },
          update: { $setOnInsert: newRecordFields(facts, at) },
          upsert: true,
        },
      })),
      { ordered: false },
    );
    return result.upsertedCount;
  }

  /** Every plan a subscription is on or moves to: the catalog must still have each. */
  async plansInUse(): Promise<string[]> {
    const [current, scheduled] = await Promise.all([
      this.subscriptions.distinct('planId').exec(),
      this.subscriptions.distinct('scheduledChange.planId').exec(),
    ]);
    return [...new Set([...current, ...scheduled].map(String))];
  }

  /**
   * Changes the plan of a trial (ADR-035), only while the trial lasts and only from the version
   * that was read: false when the trial ended or something else changed it meanwhile.
   */
  async changeTrialPlan(
    scope: WorkspaceScope,
    change: { planId: string; cycle: BillingCycle; fromVersion: number; at: Date },
    tx: Tx,
  ): Promise<boolean> {
    const result = await this.subscriptions
      .updateOne(
        { _id: scope.workspaceId, version: change.fromVersion, trialEndsAt: { $gt: change.at } },
        {
          $set: { planId: change.planId, cycle: change.cycle, updatedAt: change.at },
          $inc: { version: 1 },
        },
        { session: tx },
      )
      .exec();
    return result.matchedCount === 1;
  }
}
