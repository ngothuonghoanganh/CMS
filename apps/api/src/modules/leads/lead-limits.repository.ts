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
   * Takes back one request `hit` counted under each key whose window is still open: for limits
   * that count what was done, not what was asked, such as confirmation emails (ADR-018).
   */
  async release(keys: readonly string[], now: Date): Promise<void> {
    await this.limits
      .updateMany(
        { key: { $in: keys }, count: { $gt: 0 }, expiresAt: { $gt: now } },
        { $inc: { count: -1 } },
      )
      .exec();
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
