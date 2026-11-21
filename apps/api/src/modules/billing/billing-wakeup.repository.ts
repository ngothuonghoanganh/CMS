import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, mongo } from 'mongoose';
import type { WakeupStream } from '../../shared/persistence/wakeup-timer.js';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import {
  BILLING_WAKEUP_ID,
  JOB_WAKEUP_MODEL,
  type JobWakeupRecord,
  NOTHING_DUE,
} from '../automations/job-wakeup.schema.js';

/**
 * The billing job's document in `job_wakeups` (ADR-034, ADR-035 T3): the earliest `nextActionAt`
 * of the subscriptions, which every instance's timer follows through a change stream. A write that
 * brings a subscription's job earlier moves it (`bump`, in that write's transaction); the instance
 * that ran the due work sets it to the next time, unless work came meanwhile (`seq` moved).
 */
@Injectable()
export class BillingWakeupRepository implements OnModuleInit {
  constructor(@InjectModel(JOB_WAKEUP_MODEL) private readonly wakeups: Model<JobWakeupRecord>) {}

  /**
   * Creates the document before any transaction moves its time: an upsert inside one would fail
   * the whole transaction when two instances start at once.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.wakeups
        .updateOne(
          { _id: BILLING_WAKEUP_ID },
          {
            $setOnInsert: {
              workspaceId: BILLING_WAKEUP_ID,
              queue: 'billing',
              dueAt: NOTHING_DUE,
              seq: 0,
            },
          },
          { upsert: true },
        )
        .exec();
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw new Error('Creating the billing job’s wake-up failed', { cause: error });
      }
    }
  }

  /** Work at `at`: the job wakes then at the latest. In the transaction of the write. */
  async bump(at: Date, tx?: Tx): Promise<void> {
    await this.wakeups
      .updateOne({ _id: BILLING_WAKEUP_ID }, { $min: { dueAt: at }, $inc: { seq: 1 } })
      .session(tx ?? null)
      .exec();
  }

  /** The document's change counter, read before the due work runs. */
  async seq(): Promise<number> {
    const wakeup = await this.wakeups
      .findById(BILLING_WAKEUP_ID, { seq: 1 })
      .lean<Pick<JobWakeupRecord, 'seq'>>()
      .exec();
    return wakeup?.seq ?? 0;
  }

  /**
   * Sets the next time once the due work ran, unless a write moved the time meanwhile (`seq`
   * changed): false then, and the caller looks again.
   */
  async settle(seq: number, next: Date | null): Promise<boolean> {
    const result = await this.wakeups
      .updateOne({ _id: BILLING_WAKEUP_ID, seq }, { $set: { dueAt: next ?? NOTHING_DUE } })
      .exec();
    return result.matchedCount === 1;
  }

  /** Every change of the document (needs the replica set, ADR-006). */
  watch(resumeAfter?: mongo.ResumeToken): WakeupStream<JobWakeupRecord> {
    return this.wakeups.collection.watch<JobWakeupRecord>(
      [
        {
          $match: {
            operationType: { $in: ['insert', 'update', 'replace'] },
            'documentKey._id': BILLING_WAKEUP_ID,
          },
        },
      ],
      { fullDocument: 'updateLookup', ...(resumeAfter === undefined ? {} : { resumeAfter }) },
    );
  }

  /** The time a change of the document names; null for one without it. */
  static timeOf(change: mongo.ChangeStreamDocument<JobWakeupRecord>): Date | null {
    if (!('fullDocument' in change)) {
      return null;
    }
    const { dueAt } = change.fullDocument;
    return dueAt.getTime() < NOTHING_DUE.getTime() ? dueAt : null;
  }
}
