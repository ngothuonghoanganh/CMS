import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import { LEAD_LIMIT_MODEL, LEAD_LIMITS_KEY_INDEX, type LeadLimitRecord } from './lead.schema.js';

/** One counted request in a window, and the window's end. */
export interface LimitWindow {
  count: number;
  expiresAt: Date;
}

/** A request `hit` counted: its key, and the end of the window that counted it. */
export interface CountedHit {
  key: string;
  expiresAt: Date;
}

/** Rate-limit counters shared by every API instance (ADR-016), like `login_attempts`. */
@Injectable()
export class LeadLimitsRepository {
  constructor(@InjectModel(LEAD_LIMIT_MODEL) private readonly limits: Model<LeadLimitRecord>) {}

  /** Counts one request atomically; a window that has ended starts again at 1. */
  async hit(key: string, now: Date, windowEnd: Date): Promise<LimitWindow> {
    try {
      return await this.increment(key, now, windowEnd);
    } catch (error) {
      // Two first requests raced to insert the record; the loser now finds it.
      if (isDuplicateKeyError(error, LEAD_LIMITS_KEY_INDEX)) {
        return this.increment(key, now, windowEnd);
      }
      throw error;
    }
  }

  /**
   * Takes back requests `hit` counted, each hit once (a key counted three times goes down by
   * three): for limits that count what was done, not what was asked, such as confirmation emails
   * (ADR-018). Like `LoginAttemptsRepository.giveBack`, only in the window that counted it: never
   * in a later window, never in one that has ended, and never below zero.
   */
  async release(counted: readonly CountedHit[], now: Date): Promise<void> {
    const windows = new Map<string, { key: string; expiresAt: Date; hits: number }>();
    for (const { key, expiresAt } of counted) {
      const id = `${key}@${expiresAt.toISOString()}`;
      const window = windows.get(id) ?? { key, expiresAt, hits: 0 };
      window.hits += 1;
      windows.set(id, window);
    }
    if (windows.size === 0) {
      return;
    }
    await this.limits.bulkWrite(
      [...windows.values()].map(({ key, expiresAt, hits }) => ({
        updateOne: {
          filter: { key, expiresAt: { $eq: expiresAt, $gt: now }, count: { $gt: 0 } },
          update: [{ $set: { count: { $max: [{ $subtract: ['$count', hits] }, 0] } } }],
        },
      })),
      { ordered: false },
    );
  }

  private async increment(key: string, now: Date, windowEnd: Date): Promise<LimitWindow> {
    const active = { $gt: ['$expiresAt', now] };
    const record = await this.limits
      .findOneAndUpdate(
        { key },
        [
          {
            $set: {
              count: { $cond: [active, { $add: ['$count', 1] }, 1] },
              expiresAt: { $cond: [active, '$expiresAt', windowEnd] },
            },
          },
        ],
        { upsert: true, returnDocument: 'after', updatePipeline: true },
      )
      .lean<LeadLimitRecord>()
      .exec();
    return { count: record.count, expiresAt: record.expiresAt };
  }
}
