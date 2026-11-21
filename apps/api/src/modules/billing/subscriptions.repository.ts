import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type {
  BillingCycle,
  BillingInfo,
  PaymentMethod,
  ScheduledChange,
  SubscriptionFacts,
} from '@plp/contracts';
import { type Model, Types } from 'mongoose';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import type { WorkspaceRef } from '../../shared/persistence/workspace-databases.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { BillingWakeupRepository } from './billing-wakeup.repository.js';
import { SUBSCRIPTION_MODEL, type SubscriptionRecord } from './subscription.schema.js';

/** Not held now: never held, or the hold of an instance that stopped ran out. */
function unheldAt(at: Date) {
  return { $or: [{ lockedUntil: null }, { lockedUntil: { $lte: at } }] };
}

/** A new period that a payment starts (ADR-035, T2 and T3). */
export interface PaidPeriod {
  planId: string;
  cycle: BillingCycle;
  periodStart: Date;
  periodEnd: Date;
  fromVersion: number;
  at: Date;
}

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
    private readonly wakeups: BillingWakeupRepository,
  ) {}

  /**
   * The first subscription of a new workspace, in the transaction that creates it; the billing job
   * wakes for its first action (ADR-035, T3).
   */
  async create(workspaceId: ObjectId, facts: SubscriptionFacts, at: Date, tx: Tx): Promise<void> {
    await this.subscriptions.create([{ _id: workspaceId, ...newRecordFields(facts, at) }], {
      session: tx,
    });
    if (facts.nextActionAt !== null) {
      await this.wakeups.bump(facts.nextActionAt, tx);
    }
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
    if (result.upsertedCount > 0 && facts.nextActionAt !== null) {
      await this.wakeups.bump(facts.nextActionAt);
    }
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
  async startPaidPeriod(ref: WorkspaceRef, change: PaidPeriod, tx: Tx): Promise<boolean> {
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
   * The next period of a paid plan once its renewal is paid (ADR-035, T3): the plan and cycle the
   * invoice charged (a scheduled change applied), from the end of the period it follows, only
   * while the subscription still waits for that period and from the version read in `tx`.
   */
  async renewPeriod(ref: WorkspaceRef, change: PaidPeriod, tx: Tx): Promise<boolean> {
    const result = await this.subscriptions
      .updateOne(
        {
          _id: ref.workspaceId,
          version: change.fromVersion,
          trialEndsAt: null,
          periodEnd: change.periodStart,
        },
        {
          $set: {
            planId: change.planId,
            cycle: change.cycle,
            periodStart: change.periodStart,
            periodEnd: change.periodEnd,
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
   * A canceled plan paid for again (ADR-035, T3): a new period from the payment, only while the
   * plan is still stopped and from the version read in `tx`. No trial: one per workspace.
   */
  async restartPeriod(ref: WorkspaceRef, change: PaidPeriod, tx: Tx): Promise<boolean> {
    const result = await this.subscriptions
      .updateOne(
        {
          _id: ref.workspaceId,
          version: change.fromVersion,
          trialEndsAt: null,
          cancelAtPeriodEnd: true,
          periodEnd: { $lte: change.at },
        },
        {
          $set: {
            planId: change.planId,
            cycle: change.cycle,
            periodStart: change.periodStart,
            periodEnd: change.periodEnd,
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
   * The invoice the subscription now waits for (ADR-035, T3): the job's charge at the end of the
   * trial or period, or a transfer of a plan paid now; from the version read in `tx`.
   */
  async waitFor(
    ref: WorkspaceRef,
    change: { invoiceId: ObjectId; fromVersion: number; at: Date },
    tx: Tx,
  ): Promise<boolean> {
    const result = await this.subscriptions
      .updateOne(
        { _id: ref.workspaceId, version: change.fromVersion },
        { $set: { openInvoiceId: change.invoiceId, updatedAt: change.at }, $inc: { version: 1 } },
        { session: tx },
      )
      .exec();
    return result.matchedCount === 1;
  }

  /** Stops waiting for an invoice voided before it was paid (a transfer replaced by a new choice). */
  async stopWaitingFor(ref: WorkspaceRef, invoiceIds: readonly ObjectId[], tx: Tx): Promise<void> {
    if (invoiceIds.length === 0) {
      return;
    }
    await this.subscriptions
      .updateOne(
        { _id: ref.workspaceId, openInvoiceId: { $in: [...invoiceIds] } },
        { $set: { openInvoiceId: null }, $inc: { version: 1 } },
        { session: tx },
      )
      .exec();
  }

  /**
   * The first refused charge of the invoice the subscription waits for: the grace and the retries
   * count from it (ADR-035, T3). A later refusal leaves it.
   */
  async recordFailure(
    ref: WorkspaceRef,
    failure: { invoiceId: ObjectId; at: Date },
    tx: Tx,
  ): Promise<void> {
    await this.subscriptions
      .updateOne(
        { _id: ref.workspaceId, openInvoiceId: failure.invoiceId, failedSince: null },
        { $set: { failedSince: failure.at, updatedAt: failure.at }, $inc: { version: 1 } },
        { session: tx },
      )
      .exec();
  }

  /** "Hủy gói" or "Giữ lại gói" (ADR-035, T3), from the version read in `tx`. */
  async setCancelAtPeriodEnd(
    ref: WorkspaceRef,
    change: { cancel: boolean; fromVersion: number; at: Date },
    tx: Tx,
  ): Promise<boolean> {
    const result = await this.subscriptions
      .updateOne(
        { _id: ref.workspaceId, version: change.fromVersion },
        { $set: { cancelAtPeriodEnd: change.cancel, updatedAt: change.at }, $inc: { version: 1 } },
        { session: tx },
      )
      .exec();
    return result.matchedCount === 1;
  }

  /** The plan and cycle of the next period, or none (ADR-035, T3), from the version read. */
  async setScheduledChange(
    ref: WorkspaceRef,
    change: { scheduled: ScheduledChange | null; fromVersion: number; at: Date },
    tx: Tx,
  ): Promise<boolean> {
    const result = await this.subscriptions
      .updateOne(
        { _id: ref.workspaceId, version: change.fromVersion, trialEndsAt: null },
        {
          $set: { scheduledChange: change.scheduled, updatedAt: change.at },
          $inc: { version: 1 },
        },
        { session: tx },
      )
      .exec();
    return result.matchedCount === 1;
  }

  /**
   * When the billing job next has work for the subscription. An earlier time than before wakes
   * the job's timers on every instance (`job_wakeups`), in `tx`.
   */
  async setNextAction(
    ref: WorkspaceRef,
    next: { at: Date | null; before: Date | null },
    tx: Tx,
  ): Promise<void> {
    await this.subscriptions
      .updateOne({ _id: ref.workspaceId }, { $set: { nextActionAt: next.at } }, { session: tx })
      .exec();
    if (next.at !== null && (next.before === null || next.at < next.before)) {
      await this.wakeups.bump(next.at, tx);
    }
  }

  /** Subscriptions due by `at` and not held, earliest first. */
  async dueIds(at: Date, limit: number): Promise<ObjectId[]> {
    const due = await this.subscriptions
      .find({ nextActionAt: { $lte: at }, ...unheldAt(at) }, { _id: 1 })
      .sort({ nextActionAt: 1 })
      .limit(limit)
      .lean<Pick<SubscriptionRecord, '_id'>[]>()
      .exec();
    return due.map((subscription) => subscription._id);
  }

  /**
   * When the job next has work: the earliest `nextActionAt` of a subscription that is not held,
   * or the end of a hold on one (its instance stopped, or a charge holds it); null for none.
   */
  async earliestAction(at: Date): Promise<Date | null> {
    const [free, held] = await Promise.all([
      this.subscriptions
        .findOne({ nextActionAt: { $gte: new Date(0) }, ...unheldAt(at) }, { nextActionAt: 1 })
        .sort({ nextActionAt: 1 })
        .lean<Pick<SubscriptionRecord, 'nextActionAt'>>()
        .exec(),
      this.subscriptions
        .findOne({ lockedUntil: { $gt: at }, nextActionAt: { $ne: null } }, { lockedUntil: 1 })
        .sort({ lockedUntil: 1 })
        .lean<Pick<SubscriptionRecord, 'lockedUntil'>>()
        .exec(),
    ]);
    const times = [free?.nextActionAt, held?.lockedUntil].filter(
      (time): time is Date => time instanceof Date,
    );
    return times.length === 0 ? null : new Date(Math.min(...times.map((time) => time.getTime())));
  }

  /**
   * Takes a due subscription for one run of the job until `until` (`lockedUntil`): no other
   * instance, and no charge of the owner, acts on it meanwhile. Its facts; null when it is not
   * due or another holds it.
   */
  async claim(
    ref: WorkspaceRef,
    hold: { at: Date; until: Date },
  ): Promise<SubscriptionFacts | null> {
    const record = await this.subscriptions
      .findOneAndUpdate(
        { _id: ref.workspaceId, nextActionAt: { $lte: hold.at }, ...unheldAt(hold.at) },
        { $set: { lockedUntil: hold.until } },
        { returnDocument: 'after' },
      )
      .lean<SubscriptionRecord>()
      .exec();
    return record ? toFacts(record) : null;
  }

  /**
   * Ends a run of the job: sets the next time and lets go, only if the run still holds it (a run
   * slower than its hold leaves both to the instance that took it over).
   */
  async finishRun(
    ref: WorkspaceRef,
    run: { until: Date; next: Date | null },
    tx: Tx,
  ): Promise<boolean> {
    const result = await this.subscriptions
      .updateOne(
        { _id: ref.workspaceId, lockedUntil: run.until },
        { $set: { lockedUntil: null, nextActionAt: run.next } },
        { session: tx },
      )
      .exec();
    return result.matchedCount === 1;
  }

  /** Whether the job's run still holds the subscription (checked in `tx` before it writes). */
  async stillHeld(ref: WorkspaceRef, until: Date, tx: Tx): Promise<boolean> {
    const found = await this.subscriptions
      .exists({ _id: ref.workspaceId, lockedUntil: until })
      .session(tx)
      .exec();
    return found !== null;
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
        {
          // The newest choice wins: a downgrade scheduled before the upgrade is dropped (T3).
          $set: { planId: change.planId, scheduledChange: null, updatedAt: change.at },
          $inc: { version: 1 },
        },
        { session: tx },
      )
      .exec();
    return result.matchedCount === 1;
  }
}
