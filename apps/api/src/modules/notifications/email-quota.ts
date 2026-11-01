import { Injectable, Logger } from '@nestjs/common';
import type { AppError } from '../../shared/errors.js';
import { type CountedHit, LeadLimitsRepository } from '../leads/lead-limits.repository.js';
import { loggableLimitKey } from './domain/notification-rules.js';

const DAY_MS = 86_400_000;

/** One daily limit an email counts against. */
export interface EmailLimit {
  key: string;
  max: number;
}

/** A use of the quota: what its emails are, for the log, and the answer over a limit. */
export interface QuotaUse {
  /** E.g. "Confirmation email"; the log says "<what> still counted: …". */
  what: string;
  tooMany: () => AppError;
}

/**
 * Daily limits on the emails the API sends for people, shared by every API instance (ADR-018,
 * ADR-021): confirmation links of lead recipients, invitations, access requests.
 */
@Injectable()
export class EmailQuota {
  private readonly logger = new Logger(EmailQuota.name);

  constructor(private readonly limits: LeadLimitsRepository) {}

  /**
   * Counts `emails` emails against every limit before anything is stored or sent, so requests at
   * the same time cannot pass a limit together; over a limit throws `use.tooMany()`. Returns what
   * was counted: the caller gives back with `giveBack` the emails that do not go out after all.
   * The limits count emails sent, so a request refused here counts nowhere either. When one
   * counter fails, the others give their emails back before the error goes on.
   */
  async take(
    limits: readonly EmailLimit[],
    use: QuotaUse,
    now: Date,
    emails = 1,
  ): Promise<CountedHit[]> {
    const windowEnd = new Date(now.getTime() + DAY_MS);
    const tries = limits.flatMap((limit) => Array.from({ length: emails }, () => limit));
    const settled = await Promise.allSettled(
      tries.map(async (limit) => {
        const window = await this.limits.hit(limit.key, now, windowEnd);
        return { limit, ...window };
      }),
    );
    const counted = settled.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    const hits = counted.map(({ limit, expiresAt }) => ({ key: limit.key, expiresAt }));
    const failures = settled.flatMap((result): unknown[] =>
      result.status === 'rejected' ? [result.reason] : [],
    );
    if (failures.length > 0) {
      await this.giveBack(hits, use);
      throw new Error(`${use.what} could not be counted against the daily limits`, {
        cause: failures.length === 1 ? failures[0] : new AggregateError(failures),
      });
    }
    if (counted.some(({ limit, count }) => count > limit.max)) {
      await this.giveBack(hits, use);
      throw use.tooMany();
    }
    return hits;
  }

  /** Runs `task`; when it fails, the emails counted for it are given back before the error goes on. */
  async giveBackOnError<T>(
    hits: readonly CountedHit[],
    use: QuotaUse,
    task: () => Promise<T>,
  ): Promise<T> {
    try {
      return await task();
    } catch (error) {
      await this.giveBack(hits, use);
      throw error;
    }
  }

  /**
   * Gives back emails `take` counted that do not go out after all. The request keeps its own
   * outcome either way. When giving back fails, the emails stay counted, which is the safe side
   * (the window ends within a day), and the failure is logged with the counters it left, named
   * without the hash of an address (`loggableLimitKey`).
   */
  async giveBack(hits: readonly CountedHit[], use: QuotaUse): Promise<void> {
    try {
      await this.limits.release(hits, new Date());
    } catch (error) {
      this.logger.error(
        { err: error, limits: hits.map(({ key }) => loggableLimitKey(key)) },
        `${use.what} still counted: taking it back from the daily limits failed`,
      );
    }
  }
}
