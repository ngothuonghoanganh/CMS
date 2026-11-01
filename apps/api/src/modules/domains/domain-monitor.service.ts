import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { Env } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import { DomainChecker } from './domain-checker.service.js';
import type { DomainRecord } from './domain.schema.js';
import { DomainsRepository } from './domains.repository.js';

/** Domains one round checks at most. */
export const DOMAINS_PER_ROUND = 50;

/** How long a taken domain stays this instance's if its check never finishes. */
const LEASE_MS = 5 * 60_000;

/** Checks running at once: a domain whose DNS never answers holds up only one of them. */
const WORKERS = 5;

/** A round takes no new domain after this, well within the lease of the ones it took. */
export const ROUND_BUDGET_MS = 60_000;

/**
 * Checks the domains that are due, every `DOMAIN_MONITOR_INTERVAL_MS` on each instance (ADR-022).
 * Each domain is taken with a conditional update first, so two instances never check it at once.
 */
@Injectable()
export class DomainMonitor implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DomainMonitor.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly domains: DomainsRepository,
    private readonly checker: DomainChecker,
  ) {}

  onApplicationBootstrap(): void {
    if (this.env.DOMAIN_MONITOR_INTERVAL_MS > 0) {
      this.timer = setInterval(() => {
        void this.runDue();
      }, this.env.DOMAIN_MONITOR_INTERVAL_MS);
      this.timer.unref();
    }
  }

  onApplicationShutdown(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
    }
  }

  /**
   * Checks up to `DOMAINS_PER_ROUND` due domains, `WORKERS` at a time; a round still running is
   * not doubled. Each domain is taken and checked at the time it is reached, so its lease and its
   * next check count from then, not from the start of a long round. `at` fixes that time in tests.
   */
  async runDue(at?: Date): Promise<number> {
    if (this.running) {
      return 0;
    }
    this.running = true;
    const started = Date.now();
    let taken = 0;
    const work = async (): Promise<void> => {
      while (taken < DOMAINS_PER_ROUND && Date.now() - started < ROUND_BUDGET_MS) {
        // The place in the round is held before waiting, so the workers never pass its size.
        taken += 1;
        let domain: DomainRecord | null;
        try {
          domain = await this.domains.claimDue(at ?? new Date(), LEASE_MS);
        } catch (error) {
          taken -= 1;
          throw error;
        }
        if (domain === null) {
          taken -= 1;
          return;
        }
        try {
          await this.checker.check(domain, at ?? new Date());
        } catch (error) {
          this.logger.error(
            { err: error, domainId: domain._id.toHexString() },
            'Domain check failed; it is tried again when its lease ends',
          );
        }
      }
    };
    // Every worker ends before the round does, even when another one failed.
    const outcomes = await Promise.allSettled(Array.from({ length: WORKERS }, work));
    this.running = false;
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') {
        const reason: unknown = outcome.reason;
        this.logger.error({ err: reason }, 'Taking the due domains failed');
      }
    }
    return taken;
  }
}
