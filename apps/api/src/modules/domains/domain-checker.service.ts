import { Injectable, Logger } from '@nestjs/common';
import { can } from '@plp/contracts';
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
import { AccessService } from '../workspaces/access.service.js';
import { WorkspacesRepository } from '../workspaces/workspaces.repository.js';
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

/** Aborts the transaction of a verification that did not happen. */
class NotVerified extends Error {}

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
    private readonly access: AccessService,
    private readonly workspaces: WorkspacesRepository,
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
      // The last check stands; DNS is asked again on the usual schedule, which ends after 7
      // days for a domain never verified (names behind dead nameservers are not asked forever).
      this.logger.warn(
        { err: error, domainId: domain._id.toHexString() },
        'Domain check skipped: DNS did not answer',
      );
      return (
        (await this.domains.saveCheck(domain._id, {
          check: domain.check,
          lost: domain.lostSince !== null,
          nextCheckAt: nextCheckAt(domain, now),
        })) ?? domain
      );
    }
    const seen = evaluateDns(domain.token, answers, this.targets);
    let verifiedAt = domain.verifiedAt;
    if (verifiedAt === null && seen.txt === 'ok') {
      // Not verified here: another check of this domain may just have verified it.
      verifiedAt = (await this.verify(domain, now))
        ? now
        : ((await this.domains.findById(domain._id))?.verifiedAt ?? null);
    }
    if (
      verifiedAt !== null &&
      seen.routing === 'ok' &&
      (domain.verifiedAt === null || domain.check.routing !== 'ok')
    ) {
      await this.domains.saveDns(domain._id, seen);
    }
    const check = await this.httpsOf(domain, { ...seen, verifiedAt }, now);
    const before = domainStatus(domain, false, now);
    const after = domainStatus({ verifiedAt, check, activeSince: domain.activeSince }, false, now);
    let saved =
      (await this.domains.saveCheck(domain._id, {
        check,
        lost: after === 'lost',
        nextCheckAt: nextCheckAt({ verifiedAt, watchSince: domain.watchSince }, now, after),
      })) ?? domain;
    if (before !== after || verifiedAt !== domain.verifiedAt) {
      await this.revalidate(domain.siteId);
    }
    // Only the check that marks it tells: two checks of one domain at once send one email.
    if (after === 'active' && (await this.domains.markSince(domain._id, 'activeSince', now))) {
      saved = { ...saved, activeSince: now };
      await this.notify(saved, 'active');
    } else if (after === 'lost' && (await this.domains.markSince(domain._id, 'lostSince', now))) {
      saved = { ...saved, lostSince: now };
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
      const previous = await this.transactions.run(async (tx) => {
        const owner = await this.domains.findOwner(domain.hostname, tx);
        const moving = owner !== null && !owner._id.equals(domain._id) ? owner : null;
        if (moving !== null) {
          await this.domains.removeInTx(moving._id, tx);
          await this.sites.clearPrimaryDomain(moving.siteId, moving._id, tx);
        }
        if (!(await this.domains.verify(domain._id, now, tx))) {
          // Removed, or verified by another check, meanwhile: the previous owner keeps it.
          throw new NotVerified();
        }
        return moving;
      });
      if (previous !== null) {
        await this.revalidate(previous.siteId);
        await this.notify(previous, 'moved');
      }
      return true;
    } catch (error) {
      if (error instanceof NotVerified) {
        return false;
      }
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

  /**
   * Who hears about the domain: who added it while they still manage the site's domains, else
   * Chủ sở hữu, so someone removed or demoted is told nothing and the news still reaches someone.
   */
  private async contactOf(domain: DomainRecord): Promise<ObjectId | null> {
    const adder = await this.access.memberAccess(domain.workspaceId, domain.addedBy);
    if (
      adder !== null &&
      can(adder.access, 'domains.manage') &&
      this.access.coversSite(adder, domain.siteId)
    ) {
      return domain.addedBy;
    }
    return (await this.workspaces.findOwnerOf(domain.workspaceId))?.userId ?? null;
  }

  /** Emails the domain's contact; a failure is logged, the check stands. */
  private async notify(domain: DomainRecord, event: 'active' | 'lost' | 'moved'): Promise<void> {
    const [site, contactId] = await Promise.all([
      this.sites.findSubdomain(domain.siteId),
      this.contactOf(domain),
    ]);
    const [contact] = contactId === null ? [] : await this.users.findContacts([contactId]);
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
