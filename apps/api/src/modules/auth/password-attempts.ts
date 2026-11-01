import { Injectable } from '@nestjs/common';
import type { Env } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import type { AppError } from '../../shared/errors.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import {
  type AttemptWindow,
  LoginAttemptsRepository,
  loginAccountKey,
} from './login-attempts.repository.js';

/** What a check is, for its errors. */
export interface PasswordCheckUse {
  /** E.g. "Login"; an error says "<what> failed, and giving its attempt back failed too". */
  what: string;
  /** The answer over the limit, with the minutes until the window ends. */
  tooMany: (minutes: number) => AppError;
}

/**
 * The per-account limit of wrong passwords (ADR-004), for logging in and for changing the password
 * (ADR-026): `LOGIN_FAILURE_LIMIT` per window of `LOGIN_FAILURE_WINDOW_MINUTES`, counted in
 * MongoDB for every API instance.
 */
@Injectable()
export class PasswordAttempts {
  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly attempts: LoginAttemptsRepository,
  ) {}

  /**
   * One attempt at the password of `email`. It is counted before `check` runs, so parallel
   * attempts cannot all slip under the limit; over the limit it is refused even with the right
   * password. `check` resolves null for a wrong password, which keeps the attempt counted; a
   * result clears the count. When the check fails on our side (database, password hashing), the
   * attempt is given back: only a wrong password may use up the account's attempts.
   */
  async check<T>(
    email: string,
    use: PasswordCheckUse,
    check: () => Promise<T | null>,
  ): Promise<T | null> {
    const accountKey = loginAccountKey(this.env.LOGIN_ATTEMPT_SECRET, email);
    const now = new Date();
    const windowEnd = new Date(now.getTime() + this.env.LOGIN_FAILURE_WINDOW_MINUTES * 60_000);
    const attempts = await this.attempts.begin(accountKey, now, windowEnd);
    if (attempts.count > this.env.LOGIN_FAILURE_LIMIT) {
      throw use.tooMany(
        Math.max(1, Math.ceil((attempts.expiresAt.getTime() - now.getTime()) / 60_000)),
      );
    }
    try {
      const result = await check();
      if (result !== null) {
        await this.attempts.clear(accountKey);
      }
      return result;
    } catch (error) {
      return this.giveBack(accountKey, attempts, use, error);
    }
  }

  /** A new password ends the window: nobody is held back by guesses at the old one. */
  clear(email: string, tx: Tx): Promise<void> {
    return this.attempts.clear(loginAccountKey(this.env.LOGIN_ATTEMPT_SECRET, email), tx);
  }

  /** Rethrows `error` once the attempt it counted is given back. */
  private async giveBack(
    accountKey: string,
    attempts: AttemptWindow,
    use: PasswordCheckUse,
    error: unknown,
  ): Promise<never> {
    try {
      await this.attempts.giveBack(accountKey, attempts, new Date());
    } catch (giveBackError) {
      throw new AggregateError(
        [error, giveBackError],
        `${use.what} failed, and giving its attempt back failed too`,
        { cause: giveBackError },
      );
    }
    throw error;
  }
}
