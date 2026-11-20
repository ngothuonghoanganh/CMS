import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { BillingCycle, BillingInfo, PaymentMethod, SubscriptionFacts } from '@plp/contracts';
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
   * Writes the subscription in `tx` without changing its facts (`holdSeq`), so that `tx` and any
   * change of the subscription at the same moment cannot both commit: what `tx` reads of the plan
   * after it stays true until it commits.
   */
  async hold(ref: WorkspaceRef, tx: Tx): Promise<void> {
    const result = await this.subscriptions
      .updateOne({ _id: ref.workspaceId }, { $inc: { holdSeq: 1 } }, { session: tx })
      .exec();
    if (result.matchedCount !== 1) {
      throw new Error(`Workspace ${ref.workspaceId.toHexString()} has no subscription (ADR-035)`);
    }
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

  /** Stores the card the gateway saved, in place of any earlier one (ADR-035). */
  async setPaymentMethod(
    ref: WorkspaceRef,
    method: PaymentMethod,
    at: Date,
    tx: Tx,
  ): Promise<boolean> {
    const result = await this.subscriptions
      .updateOne(
        { _id: ref.workspaceId },
        { $set: { paymentMethod: method, updatedAt: at }, $inc: { version: 1 } },
        { session: tx },
      )
      .exec();
    return result.matchedCount === 1;
  }

  /** "Thông tin xuất hóa đơn": invoices made from now on copy it. */
  async setBillingInfo(ref: WorkspaceRef, info: BillingInfo, at: Date, tx: Tx): Promise<boolean> {
    const result = await this.subscriptions
      .updateOne(
        { _id: ref.workspaceId },
        { $set: { billingInfo: info, updatedAt: at }, $inc: { version: 1 } },
        { session: tx },
      )
      .exec();
    return result.matchedCount === 1;
  }

  /**
   * Holds the subscription for one charge until `until` (`lockedUntil`, ADR-035): no second charge
   * of the workspace starts before this one is recorded, or the hold runs out. With
   * `fromVersion`, only while nothing changed the subscription since that version was read.
   * `busy` when another charge holds it, `changed` when the version moved.
   */
  async holdForCharge(
    ref: WorkspaceRef,
    hold: { at: Date; until: Date; fromVersion?: number },
    tx: Tx,
  ): Promise<'held' | 'busy' | 'changed'> {
    const result = await this.subscriptions
      .updateOne(
        {
          _id: ref.workspaceId,
          ...(hold.fromVersion === undefined ? {} : { version: hold.fromVersion }),
          $or: [{ lockedUntil: null }, { lockedUntil: { $lte: hold.at } }],
        },
        { $set: { lockedUntil: hold.until } },
        { session: tx },
      )
      .exec();
    if (result.matchedCount === 1) {
      return 'held';
    }
    const current = await this.subscriptions
      .findById(ref.workspaceId, { lockedUntil: 1 })
      .session(tx)
      .lean<Pick<SubscriptionRecord, 'lockedUntil'>>()
      .exec();
    if (current === null) {
      throw new Error(`Workspace ${ref.workspaceId.toHexString()} has no subscription (ADR-035)`);
    }
    return current.lockedUntil !== null && current.lockedUntil > hold.at ? 'busy' : 'changed';
  }

  /** Lets the next charge start; only the hold of `until`, never one taken after it ran out. */
  async releaseCharge(ref: WorkspaceRef, until: Date, tx?: Tx): Promise<void> {
    await this.subscriptions
      .updateOne(
        { _id: ref.workspaceId, lockedUntil: until },
        { $set: { lockedUntil: null } },
        tx ? { session: tx } : {},
      )
      .exec();
  }

  /**
   * Ends the trial with its first paid period (ADR-035, T2), only while the trial is unpaid and
   * from the version read in `tx`: false otherwise.
   */
  async startPaidPeriod(
    ref: WorkspaceRef,
    change: {
      planId: string;
      cycle: BillingCycle;
      periodStart: Date;
      periodEnd: Date;
      fromVersion: number;
      at: Date;
    },
    tx: Tx,
  ): Promise<boolean> {
    const result = await this.subscriptions
      .updateOne(
        { _id: ref.workspaceId, version: change.fromVersion, trialEndsAt: { $ne: null } },
        {
          $set: {
            planId: change.planId,
            cycle: change.cycle,
            trialEndsAt: null,
            periodStart: change.periodStart,
            periodEnd: change.periodEnd,
            nextActionAt: change.periodEnd,
            cancelAtPeriodEnd: false,
            scheduledChange: null,
            openInvoiceId: null,
            failedSince: null,
            updatedAt: change.at,
          },
          $inc: { version: 1 },
        },
        { session: tx },
      )
      .exec();
    return result.matchedCount === 1;
  }

  /**
   * Moves a paid period to a higher plan (ADR-035), only while it is still on the plan, cycle and
   * period the upgrade was priced for, and from the version read in `tx`: false otherwise.
   */
  async upgradePlan(
    ref: WorkspaceRef,
    change: {
      from: { planId: string; cycle: BillingCycle };
      periodEnd: Date;
      planId: string;
      fromVersion: number;
      at: Date;
    },
    tx: Tx,
  ): Promise<boolean> {
    const result = await this.subscriptions
      .updateOne(
        {
          _id: ref.workspaceId,
          version: change.fromVersion,
          trialEndsAt: null,
          planId: change.from.planId,
          cycle: change.from.cycle,
          periodEnd: change.periodEnd,
        },
        { $set: { planId: change.planId, updatedAt: change.at }, $inc: { version: 1 } },
        { session: tx },
      )
      .exec();
    return result.matchedCount === 1;
  }
}
