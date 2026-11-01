import { Injectable } from '@nestjs/common';
import {
  type AddDomainRequest,
  CUSTOM_DOMAINS_MAX,
  type Domain,
  type DomainListResponse,
  normalizeHostname,
  type SetPrimaryDomainRequest,
} from '@plp/contracts';
import { baseDomainOf, type Env } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import { AppError, notFound, validationFailed } from '../../shared/errors.js';
import { newObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { UsersRepository } from '../auth/users.repository.js';
import { RevalidationClient } from '../revalidation/revalidation.client.js';
import type { SiteRecord } from '../sites/site.schema.js';
import { SitesRepository } from '../sites/sites.repository.js';
import { SITE_NOT_FOUND, SitesService } from '../sites/sites.service.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { DomainChecker } from './domain-checker.service.js';
import { DOMAIN_NOT_FOUND, toDomainDto } from './domain-dto.js';
import { domainStatus, newDomainToken } from './domain/domain-rules.js';
import { type DomainRecord, EMPTY_CHECK } from './domain.schema.js';
import { DomainsRepository } from './domains.repository.js';

/** "Kiểm tra ngay" more often than this answers with the last check. */
const RECHECK_AFTER_MS = 5000;

/** Custom domains of a site for Chủ sở hữu and Quản trị (boards 13, 14; ADR-022). */
@Injectable()
export class DomainsService {
  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly sitesService: SitesService,
    private readonly sites: SitesRepository,
    private readonly domains: DomainsRepository,
    private readonly users: UsersRepository,
    private readonly checker: DomainChecker,
    private readonly revalidation: RevalidationClient,
  ) {}

  async list(user: AuthenticatedUser, siteId: string): Promise<DomainListResponse> {
    const { scope, site } = await this.sitesService.access(user, siteId, 'domains.manage');
    return this.listOf(scope, site);
  }

  /**
   * Adds a domain and checks it at once. A domain another site owns is added too: its owner proves
   * it is theirs with the TXT record, which then moves it here (ADR-022).
   */
  async add(user: AuthenticatedUser, siteId: string, input: AddDomainRequest): Promise<Domain> {
    const { scope, site } = await this.sitesService.access(user, siteId, 'domains.manage');
    const normalized = normalizeHostname(input.hostname, baseDomainOf(this.env));
    if (!normalized.ok) {
      throw validationFailed([
        { path: ['hostname'], code: 'invalid', message: normalized.message },
      ]);
    }
    const { hostname } = normalized;
    if (hostname === this.env.CUSTOM_DOMAIN_CNAME_TARGET) {
      throw validationFailed([
        { path: ['hostname'], code: 'invalid', message: 'Đây là địa chỉ của hệ thống' },
      ]);
    }
    if ((await this.domains.countForSite(scope, site._id)) >= CUSTOM_DOMAINS_MAX) {
      throw new AppError(
        409,
        'domain_limit_reached',
        `Mỗi site có tối đa ${CUSTOM_DOMAINS_MAX} tên miền riêng`,
      );
    }
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
    if (!(await this.domains.insert(scope, record))) {
      throw new AppError(409, 'domain_exists', 'Site đã có tên miền này');
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
    if (site.primaryDomain?.domainId.equals(domain._id)) {
      throw new AppError(409, 'conflict', 'Không ngắt được địa chỉ chính', {
        detail: 'Hãy đặt một địa chỉ khác làm địa chỉ chính trước.',
      });
    }
    if (!(await this.domains.remove(scope, site._id, domain._id))) {
      throw notFound(DOMAIN_NOT_FOUND);
    }
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
    let primary = null;
    if (input.domainId !== null) {
      const domain = await this.find(scope, site, input.domainId);
      if (domainStatus(domain, false, new Date()) !== 'active') {
        throw new AppError(
          409,
          'conflict',
          'Chỉ tên miền đang hoạt động mới làm địa chỉ chính được',
          {
            detail: 'Đợi tên miền hoạt động với HTTPS rồi thử lại.',
          },
        );
      }
      primary = { domainId: domain._id, hostname: domain.hostname };
    }
    const updated = await this.sites.setPrimaryDomain(scope, site._id, primary);
    if (!updated) {
      throw notFound(SITE_NOT_FOUND);
    }
    await this.revalidation.revalidateSite(site.subdomain);
    return this.listOf(scope, updated);
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
    const [elsewhere, adders] = await Promise.all([
      this.domains.ownedElsewhere(
        domains.filter((domain) => domain.verifiedAt === null).map((domain) => domain.hostname),
        site._id,
      ),
      this.users.findRefs(domains.map((domain) => domain.addedBy)),
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
