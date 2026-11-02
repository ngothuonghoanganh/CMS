import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import {
  AUTH_EMAIL_LIMIT_MODEL,
  AUTH_EMAIL_LIMITS_KEY_INDEX,
  type AuthEmailLimitRecord,
} from './account.schema.js';
import type { AttemptWindow } from './login-attempts.repository.js';

/**
 * Account emails per mailbox and hour (ADR-026), shared by every API instance. Counted like
 * failed logins (`LoginAttemptsRepository`): atomically before sending, given back when the
 * email did not go out.
 */
@Injectable()
export class AuthEmailLimitsRepository {
  constructor(
    @InjectModel(AUTH_EMAIL_LIMIT_MODEL) private readonly limits: Model<AuthEmailLimitRecord>,
  ) {}

  /** Counts one email; a window that has ended starts again at 1. */
  async count(key: string, now: Date, windowEnd: Date): Promise<AttemptWindow> {
    try {
      return await this.increment(key, now, windowEnd);
    } catch (error) {
      // Two first emails raced to insert the record; the loser now finds it.
      if (isDuplicateKeyError(error, AUTH_EMAIL_LIMITS_KEY_INDEX)) {
        return this.increment(key, now, windowEnd);
      }
      throw error;
    }
  }

  /**
   * Gives back one email of the window that counted it: only while that window still runs, never
   * in a later one, never below zero.
   */
  async giveBack(key: string, window: AttemptWindow, now: Date): Promise<void> {
    await this.limits
      .updateOne(
        { key, expiresAt: { $eq: window.expiresAt, $gt: now }, count: { $gt: 0 } },
        { $inc: { count: -1 } },
      )
      .exec();
  }

  private async increment(key: string, now: Date, windowEnd: Date): Promise<AttemptWindow> {
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
      .lean<AuthEmailLimitRecord>()
      .exec();
    return { count: record.count, expiresAt: record.expiresAt };
  }
}
