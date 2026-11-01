import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { Env } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import { DomainChecker } from './domain-checker.service.js';
import { DomainsRepository } from './domains.repository.js';

/** Domains one round checks at most. */
export const DOMAINS_PER_ROUND = 50;

/** How long a taken domain stays this instance's if its check never finishes. */
const LEASE_MS = 5 * 60_000;

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

  /** Checks up to `DOMAINS_PER_ROUND` due domains; a round still running is not doubled. */
  async runDue(now = new Date()): Promise<number> {
    if (this.running) {
      return 0;
    }
    this.running = true;
    let checked = 0;
    try {
      while (checked < DOMAINS_PER_ROUND) {
        const domain = await this.domains.claimDue(now, LEASE_MS);
        if (domain === null) {
          break;
        }
        checked += 1;
        try {
          await this.checker.check(domain, now);
        } catch (error) {
          this.logger.error(
            { err: error, domainId: domain._id.toHexString() },
            'Domain check failed; it is tried again when its lease ends',
          );
        }
      }
    } catch (error) {
      this.logger.error({ err: error }, 'Taking the due domains failed');
    } finally {
      this.running = false;
    }
    return checked;
  }
}
