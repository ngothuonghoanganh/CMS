import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import {
  LOGIN_ATTEMPT_MODEL,
  LOGIN_ATTEMPTS_ACCOUNT_INDEX,
  type LoginAttemptRecord,
} from './user.schema.js';

/** Key of an account's attempts; the same for an email that has no account (no enumeration). */
export function loginAccountKey(email: string): string {
  return createHash('sha256').update(email).digest('hex');
}

export interface AttemptWindow {
  /** Attempts in the window, including this one. */
  count: number;
  expiresAt: Date;
}

@Injectable()
export class LoginAttemptsRepository {
  constructor(
    @InjectModel(LOGIN_ATTEMPT_MODEL) private readonly attempts: Model<LoginAttemptRecord>,
  ) {}

  /**
   * Counts one attempt atomically, before the password is checked, so parallel attempts cannot
   * all slip under the limit. A window that has ended starts again at 1.
   */
  async begin(accountKey: string, now: Date, windowEnd: Date): Promise<AttemptWindow> {
    try {
      return await this.increment(accountKey, now, windowEnd);
    } catch (error) {
      // Two first attempts raced to insert the record; the loser now finds it.
      if (isDuplicateKeyError(error, LOGIN_ATTEMPTS_ACCOUNT_INDEX)) {
        return this.increment(accountKey, now, windowEnd);
      }
      throw error;
    }
  }

  /** A successful login ends the window. */
  async clear(accountKey: string): Promise<void> {
    await this.attempts.deleteOne({ accountKey }).exec();
  }

  private async increment(accountKey: string, now: Date, windowEnd: Date): Promise<AttemptWindow> {
    const active = { $gt: ['$expiresAt', now] };
    const record = await this.attempts
      .findOneAndUpdate(
        { accountKey },
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
      .lean<LoginAttemptRecord>()
      .exec();
    return { count: record.count, expiresAt: record.expiresAt };
  }
}
