import { Injectable, Logger } from '@nestjs/common';
import { type Env, tlsCheckEnabled } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import { UsersRepository } from '../auth/users.repository.js';
import { EmailSender, EmailSendError } from '../notifications/email-sender.js';
import {
  domainActiveEmail,
  domainLostEmail,
  domainMovedEmail,
} from '../notifications/email-templates.js';
import { RevalidationClient } from '../revalidation/revalidation.client.js';
import { SitesRepository } from '../sites/sites.repository.js';
import { DomainDns, DnsUnavailableError } from './domain-dns.js';
import { DomainTls } from './domain-tls.js';
import {
  type DomainTargets,
  domainStatus,
  evaluateDns,
  nextCheckAt,
} from './domain/domain-rules.js';
import type { DomainCheck, DomainRecord } from './domain.schema.js';
import { DOMAINS_OWNER_INDEX } from './domain.schema.js';
import { DomainsRepository } from './domains.repository.js';

const MINUTE_MS = 60_000;

/**
 * Checks one domain (ADR-022): asks DNS, proves ownership by the TXT record (moving the domain from
 * another site when it was theirs), checks HTTPS, stores what it saw, and tells people and the
 * renderer when the domain starts or stops serving pages.
 */
@Injectable()
export class DomainChecker {
  private readonly logger = new Logger(DomainChecker.name);
  readonly targets: DomainTargets;

  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly domains: DomainsRepository,
    private readonly sites: SitesRepository,
    private readonly users: UsersRepository,
    private readonly dns: DomainDns,
    private readonly tls: DomainTls,
    private readonly transactions: TransactionRunner,
    private readonly sender: EmailSender,
    private readonly revalidation: RevalidationClient,
  ) {
    this.targets = { cnameTarget: env.CUSTOM_DOMAIN_CNAME_TARGET, ipv4: env.CUSTOM_DOMAIN_IPV4 };
  }

  async check(domain: DomainRecord, now = new Date()): Promise<DomainRecord> {
    let answers;
    try {
      answers = await this.dns.answers(domain.hostname);
    } catch (error) {
      if (!(error instanceof DnsUnavailableError)) {
        throw error;
      }
      // The last check stands; DNS is asked again in a minute.
      this.logger.warn(
        { err: error, domainId: domain._id.toHexString() },
        'Domain check skipped: DNS did not answer',
      );
      return (
        (await this.domains.saveCheck(domain._id, {
          check: domain.check,
          activeSince: domain.activeSince,
          lostSince: domain.lostSince,
          nextCheckAt: new Date(now.getTime() + MINUTE_MS),
        })) ?? domain
      );
    }
    const seen = evaluateDns(domain.token, answers, this.targets);
    let verifiedAt = domain.verifiedAt;
    if (verifiedAt === null && seen.txt === 'ok' && (await this.verify(domain, now))) {
      verifiedAt = now;
    }
    const check = await this.httpsOf(domain, { ...seen, verifiedAt }, now);
    const before = domainStatus(domain, false, now);
    const after = domainStatus({ verifiedAt, check, activeSince: domain.activeSince }, false, now);
    const activeSince = after === 'active' ? (domain.activeSince ?? now) : domain.activeSince;
    const lostSince = after === 'lost' ? (domain.lostSince ?? now) : null;
    const saved =
      (await this.domains.saveCheck(domain._id, {
        check,
        activeSince,
        lostSince,
        nextCheckAt: nextCheckAt({ verifiedAt, watchSince: domain.watchSince }, now),
      })) ?? domain;
    if (before !== after || verifiedAt !== domain.verifiedAt) {
      await this.revalidate(domain.siteId);
    }
    if (domain.activeSince === null && activeSince !== null) {
      await this.notify(saved, 'active');
    } else if (domain.lostSince === null && lostSince !== null) {
      await this.notify(saved, 'lost');
    }
    return saved;
  }

  /**
   * Makes the domain its hostname's owner. A previous owner on another site loses it in the same
   * transaction (and its primary address goes back to the default one); the unique index refuses
   * a second owner when two sites prove ownership at once.
   */
  private async verify(domain: DomainRecord, now: Date): Promise<boolean> {
    try {
      const { verified, previous } = await this.transactions.run(async (tx) => {
        const owner = await this.domains.findOwner(domain.hostname, tx);
        const moving = owner !== null && !owner._id.equals(domain._id) ? owner : null;
        if (moving !== null) {
          await this.domains.removeInTx(moving._id, tx);
          await this.sites.clearPrimaryDomain(moving.siteId, moving._id, tx);
        }
        return { verified: await this.domains.verify(domain._id, now, tx), previous: moving };
      });
      if (verified && previous !== null) {
        await this.revalidate(previous.siteId);
        await this.notify(previous, 'moved');
      }
      return verified;
    } catch (error) {
      if (isDuplicateKeyError(error, DOMAINS_OWNER_INDEX)) {
        // Another site proved ownership at the same moment; the next check sees it as taken.
        return false;
      }
      throw error;
    }
  }

  private async httpsOf(
    domain: DomainRecord,
    seen: Pick<DomainCheck, 'txt' | 'routing' | 'found'> & { verifiedAt: Date | null },
    now: Date,
  ): Promise<DomainCheck> {
    const { verifiedAt, ...dns } = seen;
    const base = { at: now, ...dns };
    if (verifiedAt === null || dns.routing !== 'ok') {
      return { ...base, https: 'pending', httpsValidUntil: null, httpsFailingSince: null };
    }
    if (!tlsCheckEnabled(this.env)) {
      return { ...base, https: 'unchecked', httpsValidUntil: null, httpsFailingSince: null };
    }
    const probe = await this.tls.probe(domain.hostname);
    return probe.ok
      ? { ...base, https: 'ok', httpsValidUntil: probe.validUntil, httpsFailingSince: null }
      : {
          ...base,
          https: 'failed',
          httpsValidUntil: null,
          httpsFailingSince: domain.check.httpsFailingSince ?? now,
        };
  }

  private async revalidate(siteId: ObjectId): Promise<void> {
    const site = await this.sites.findSubdomain(siteId);
    if (site !== null) {
      await this.revalidation.revalidateSite(site.subdomain);
    }
  }

  /** Emails who added the domain; a failure is logged, the check stands. */
  private async notify(domain: DomainRecord, event: 'active' | 'lost' | 'moved'): Promise<void> {
    const [site, [contact]] = await Promise.all([
      this.sites.findSubdomain(domain.siteId),
      this.users.findContacts([domain.addedBy]),
    ]);
    if (site === null || contact === undefined) {
      return;
    }
    const input = {
      hostname: domain.hostname,
      siteName: site.name,
      domainsUrl: `${this.env.ADMIN_ORIGIN}/sites/${site._id.toHexString()}/domain`,
    };
    const content =
      event === 'active'
        ? domainActiveEmail(input)
        : event === 'lost'
          ? domainLostEmail(input)
          : domainMovedEmail(input);
    try {
      await this.sender.send({ to: [contact.email], ...content });
    } catch (error) {
      this.logger.warn(
        {
          domainId: domain._id.toHexString(),
          event,
          code: error instanceof EmailSendError ? error.code : 'unknown',
        },
        'Domain email not sent',
      );
    }
  }
}
