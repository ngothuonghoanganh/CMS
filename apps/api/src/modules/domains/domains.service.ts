import { Injectable } from '@nestjs/common';
import {
  type AddDomainRequest,
  CUSTOM_DOMAINS_MAX,
  type Domain,
  type DomainAvailability,
  type DomainListResponse,
  normalizeHostname,
  type SetPrimaryDomainRequest,
  type SiteAddressStatus,
} from '@plp/contracts';
import { baseDomainOf, type Env } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import { AppError, notFound, validationFailed } from '../../shared/errors.js';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import { newObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import { ActivityRepository } from '../activity/activity.repository.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { UsersRepository } from '../auth/users.repository.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import { PagesRepository } from '../pages/pages.repository.js';
import { RevalidationClient } from '../revalidation/revalidation.client.js';
import type { SiteRecord } from '../sites/site.schema.js';
import { SitesRepository } from '../sites/sites.repository.js';
import { SITE_NOT_FOUND, SitesService } from '../sites/sites.service.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { DomainChecker } from './domain-checker.service.js';
import { DOMAIN_NOT_FOUND, toDomainDto } from './domain-dto.js';
import {
  domainStatus,
  livePagesSummary,
  newDomainToken,
  siteAddressStatus,
} from './domain/domain-rules.js';
import { type DomainRecord, DOMAINS_SITE_HOSTNAME_INDEX, EMPTY_CHECK } from './domain.schema.js';
import { DomainsRepository } from './domains.repository.js';

/** "Kiểm tra ngay" more often than this answers with the last check. */
const RECHECK_AFTER_MS = 5000;

const SYSTEM_ADDRESS_MESSAGE = 'Đây là địa chỉ của hệ thống';

type HostnameValidation = { ok: true; hostname: string } | { ok: false; reason: string };

/** Custom domains of a site for Chủ sở hữu and Quản trị (boards 13, 14; ADR-022). */
@Injectable()
export class DomainsService {
  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly sitesService: SitesService,
    private readonly sites: SitesRepository,
    private readonly domains: DomainsRepository,
    private readonly users: UsersRepository,
    private readonly pages: PagesRepository,
    private readonly activity: ActivityRepository,
    private readonly checker: DomainChecker,
    private readonly revalidation: RevalidationClient,
    private readonly transactions: TransactionRunner,
  ) {}

  async list(user: AuthenticatedUser, siteId: string): Promise<DomainListResponse> {
    const { scope, site } = await this.sitesService.access(user, siteId, 'domains.manage');
    return this.listOf(scope, site);
  }

  /**
   * Whether adding a domain would work, while it is typed on board 14: the same validation as
   * adding it, then this site's domains, then the verified owners of every site. Which site owns a
   * taken domain is never told (ADR-022).
   */
  async availability(
    user: AuthenticatedUser,
    siteId: string,
    typed: string,
  ): Promise<DomainAvailability> {
    const { scope, site } = await this.sitesService.access(user, siteId, 'domains.manage');
    const valid = this.validate(typed);
    if (!valid.ok) {
      return { hostname: typed.trim().toLowerCase(), state: 'invalid', reason: valid.reason };
    }
    const { hostname } = valid;
    const own = await this.domains.listForSite(scope, site._id);
    if (own.some((domain) => domain.hostname === hostname)) {
      return { hostname, state: 'already_added', reason: null };
    }
    const elsewhere = await this.domains.ownedElsewhere([hostname], site._id);
    return { hostname, state: elsewhere.has(hostname) ? 'taken' : 'available', reason: null };
  }

  /**
   * Adds a domain and checks it at once. A domain another site owns is added too: its owner proves
   * it is theirs with the TXT record, which then moves it here (ADR-022).
   */
  async add(user: AuthenticatedUser, siteId: string, input: AddDomainRequest): Promise<Domain> {
    const { scope, site } = await this.sitesService.access(user, siteId, 'domains.manage');
    const valid = this.validate(input.hostname);
    if (!valid.ok) {
      throw validationFailed([{ path: ['hostname'], code: 'invalid', message: valid.reason }]);
    }
    const { hostname } = valid;
    const now = new Date();
    const record: DomainRecord = {
      _id: newObjectId(),
      workspaceId: scope.workspaceId,
      siteId: site._id,
      hostname,
      token: newDomainToken(),
      addedBy: user.id,
      createdAt: now,
      verifiedAt: null,
      check: EMPTY_CHECK,
      activeSince: null,
      lostSince: null,
      watchSince: now,
      nextCheckAt: now,
    };
    try {
      // Adding writes the site, so two at once in one site conflict: the later one counts the
      // other's domain against the limit.
      await this.transactions.run(async (tx) => {
        await this.sites.recordDomainCreation(scope, site._id, tx);
        if ((await this.domains.countForSite(scope, site._id, tx)) >= CUSTOM_DOMAINS_MAX) {
          throw new AppError(
            409,
            'domain_limit_reached',
            `Mỗi site có tối đa ${CUSTOM_DOMAINS_MAX} tên miền riêng`,
          );
        }
        await this.domains.insert(scope, record, tx);
        await this.activity.record(
          scope,
          { siteId: site._id, type: 'domain.added', data: { hostname } },
          tx,
        );
      });
    } catch (error) {
      if (isDuplicateKeyError(error, DOMAINS_SITE_HOSTNAME_INDEX)) {
        throw new AppError(409, 'domain_exists', 'Site đã có tên miền này', { cause: error });
      }
      throw error;
    }
    const checked = await this.checker.check(record, now);
    return this.dto(site, checked);
  }

  /** "Kiểm tra ngay": checks now and checks quickly again for an hour. */
  async check(user: AuthenticatedUser, siteId: string, domainId: string): Promise<Domain> {
    const { scope, site } = await this.sitesService.access(user, siteId, 'domains.manage');
    const domain = await this.find(scope, site, domainId);
    const now = new Date();
    if (domain.check.at !== null && now.getTime() - domain.check.at.getTime() < RECHECK_AFTER_MS) {
      return this.dto(site, domain);
    }
    await this.domains.rewatch(domain._id, now);
    const checked = await this.checker.check({ ...domain, watchSince: now }, now);
    // A check may have changed the site's primary address (a domain moved elsewhere).
    return this.dto((await this.sites.findById(scope, site._id)) ?? site, checked);
  }

  /** Disconnects a domain; the primary address must be another one first (board 13). */
  async remove(user: AuthenticatedUser, siteId: string, domainId: string): Promise<void> {
    const { scope, site } = await this.sitesService.access(user, siteId, 'domains.manage');
    const domain = await this.find(scope, site, domainId);
    // In one transaction with the primary address it checks: making the domain primary at the same
    // moment writes it too, so one of the two waits for the other.
    await this.transactions.run(async (tx) => {
      const current = await this.sites.findById(scope, site._id, tx);
      if (current?.primaryDomain?.domainId.equals(domain._id)) {
        throw new AppError(409, 'conflict', 'Không ngắt được địa chỉ chính', {
          detail: 'Hãy đặt một địa chỉ khác làm địa chỉ chính trước.',
        });
      }
      if (!(await this.domains.remove(scope, site._id, domain._id, tx))) {
        throw notFound(DOMAIN_NOT_FOUND);
      }
      await this.activity.record(
        scope,
        { siteId: site._id, type: 'domain.removed', data: { hostname: domain.hostname } },
        tx,
      );
    });
    await this.revalidation.revalidateSite(site.subdomain);
  }

  /**
   * The primary address: an active custom domain, or the default address (null). Live pages move
   * at once: other addresses redirect to it, canonical URLs and the sitemap follow (ADR-022).
   */
  async setPrimary(
    user: AuthenticatedUser,
    siteId: string,
    input: SetPrimaryDomainRequest,
  ): Promise<DomainListResponse> {
    const { scope, site } = await this.sitesService.access(user, siteId, 'domains.manage');
    const notActive = () =>
      new AppError(409, 'conflict', 'Chỉ tên miền đang hoạt động mới làm địa chỉ chính được', {
        detail: 'Đợi tên miền hoạt động với HTTPS rồi thử lại.',
      });
    const chosen = input.domainId === null ? null : await this.find(scope, site, input.domainId);
    if (chosen !== null && domainStatus(chosen, false, new Date()) !== 'active') {
      throw notActive();
    }
    // The domain is written in the transaction too: moved to another site or disconnected at the
    // same moment, it conflicts here rather than leave the address on a domain that is gone.
    const updated = await this.transactions.run(async (tx) => {
      let primary = null;
      if (chosen !== null) {
        const held = await this.domains.holdForPrimary(scope, site._id, chosen._id, new Date(), tx);
        if (held === null) {
          throw notActive();
        }
        primary = { domainId: held._id, hostname: held.hostname };
      }
      const before = await this.sites.findById(scope, site._id, tx);
      const after = await this.sites.setPrimaryDomain(scope, site._id, primary, tx);
      const unchanged =
        (before?.primaryDomain?.domainId.toHexString() ?? null) ===
        (primary?.domainId.toHexString() ?? null);
      if (after !== null && !unchanged) {
        await this.activity.record(
          scope,
          {
            siteId: site._id,
            type: 'domain.primary_changed',
            data: {
              hostname: primary?.hostname ?? new URL(this.sitesService.defaultOrigin(site)).host,
            },
          },
          tx,
        );
      }
      return after;
    });
    if (!updated) {
      throw notFound(SITE_NOT_FOUND);
    }
    await this.revalidation.revalidateSite(site.subdomain);
    return this.listOf(scope, updated);
  }

  /** Board 01, for every role that sees the site: the primary address and the setup step. */
  async addressStatus(user: AuthenticatedUser, siteId: string): Promise<SiteAddressStatus> {
    const { scope, site } = await this.sitesService.access(user, siteId, 'pages.view');
    const domains = await this.domains.listForSite(scope, site._id);
    return siteAddressStatus(domains, site.primaryDomain?.domainId ?? null, new Date());
  }

  /** The checks of adding a domain: a public domain name that is not one of the system's. */
  private validate(typed: string): HostnameValidation {
    const normalized = normalizeHostname(typed, baseDomainOf(this.env));
    if (!normalized.ok) {
      return { ok: false, reason: normalized.message };
    }
    if (normalized.hostname === this.env.CUSTOM_DOMAIN_CNAME_TARGET) {
      return { ok: false, reason: SYSTEM_ADDRESS_MESSAGE };
    }
    return normalized;
  }

  private async find(
    scope: WorkspaceScope,
    site: SiteRecord,
    domainId: string,
  ): Promise<DomainRecord> {
    const domain = await this.domains.findForSite(
      scope,
      site._id,
      toObjectId(domainId, DOMAIN_NOT_FOUND),
    );
    if (!domain) {
      throw notFound(DOMAIN_NOT_FOUND);
    }
    return domain;
  }

  private async listOf(scope: WorkspaceScope, site: SiteRecord): Promise<DomainListResponse> {
    const domains = await this.domains.listForSite(scope, site._id);
    const now = new Date();
    const [elsewhere, adders, livePages] = await Promise.all([
      this.domains.ownedElsewhere(
        domains.filter((domain) => domain.verifiedAt === null).map((domain) => domain.hostname),
        site._id,
      ),
      this.users.findRefs(domains.map((domain) => domain.addedBy)),
      this.pages.listLiveForSite(scope, site._id),
    ]);
    return {
      items: domains.map((domain) =>
        toDomainDto(domain, {
          ownedElsewhere: elsewhere.has(domain.hostname),
          primary: site.primaryDomain?.domainId.equals(domain._id) ?? false,
          targets: this.checker.targets,
          addedByName: adders.get(domain.addedBy.toHexString())?.name ?? '',
          now,
        }),
      ),
      defaultHost: new URL(this.sitesService.defaultOrigin(site)).host,
      primaryDomainId: site.primaryDomain?.domainId.toHexString() ?? null,
      livePages: livePagesSummary(livePages.map((page) => page.publishedSlug)),
    };
  }

  private async dto(site: SiteRecord, domain: DomainRecord): Promise<Domain> {
    const [elsewhere, adders] = await Promise.all([
      domain.verifiedAt === null
        ? this.domains.ownedElsewhere([domain.hostname], site._id)
        : new Set<string>(),
      this.users.findRefs([domain.addedBy]),
    ]);
    return toDomainDto(domain, {
      ownedElsewhere: elsewhere.has(domain.hostname),
      primary: site.primaryDomain?.domainId.equals(domain._id) ?? false,
      targets: this.checker.targets,
      addedByName: adders.get(domain.addedBy.toHexString())?.name ?? '',
      now: new Date(),
    });
  }
}
