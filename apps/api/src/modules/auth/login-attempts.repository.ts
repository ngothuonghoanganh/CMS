import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import {
  LOGIN_ATTEMPT_MODEL,
  LOGIN_ATTEMPTS_ACCOUNT_INDEX,
  type LoginAttemptRecord,
} from './user.schema.js';

/**
 * Key of an account's attempts: an HMAC of the normalised email under `LOGIN_ATTEMPT_SECRET`, a
 * secret kept outside the database. A plain hash is undone by hashing a list of emails, so a copy
 * of the database would tell which addresses tried to log in. The same for an email that has no
 * account, so the key reveals no registration either (ADR-004).
 */
export function loginAccountKey(secret: string, email: string): string {
  return createHmac('sha256', secret).update(email).digest('hex');
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

  /** A successful login ends the window, and so does a reset password, in its transaction. */
  async clear(accountKey: string, tx?: Tx): Promise<void> {
    await this.attempts.deleteOne({ accountKey }, tx === undefined ? {} : { session: tx }).exec();
  }

  /**
   * Gives back one attempt of the window that counted it, after the login failed on our side
   * rather than on the password. Only while that window is still running: never in a later window,
   * never in one that has ended, and never below zero.
   */
  async giveBack(accountKey: string, window: AttemptWindow, now: Date): Promise<void> {
    await this.attempts
      .updateOne(
        { accountKey, expiresAt: { $eq: window.expiresAt, $gt: now }, count: { $gt: 0 } },
        { $inc: { count: -1 } },
      )
      .exec();
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
