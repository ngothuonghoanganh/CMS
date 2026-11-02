import { Injectable } from '@nestjs/common';
import type { Permission, Site, SubdomainAvailability } from '@plp/contracts';
import { customDomainOrigin, type Env, siteOrigin } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import { notFound } from '../../shared/errors.js';
import { type ObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { AccessService } from '../workspaces/access.service.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { toSiteDto } from './site-dto.js';
import type { SiteRecord } from './site.schema.js';
import { SitesRepository } from './sites.repository.js';
import { checkSubdomainAvailability } from './subdomain-availability.js';

export const SITE_NOT_FOUND = 'Không tìm thấy site';

/** A site the user may access, with the scope every site-scoped repository call needs. */
export interface SiteAccess {
  scope: WorkspaceScope;
  site: SiteRecord;
}

@Injectable()
export class SitesService {
  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly sites: SitesRepository,
    private readonly accessService: AccessService,
  ) {}

  /**
   * Entry point of every site-scoped endpoint, in every module: parses the id from the URL, checks
   * membership in the site's workspace, the member's sites and the permission the endpoint needs,
   * and loads the site. An unknown site, a site of another workspace and a site outside the
   * member's sites are all 404 "Không tìm thấy site" (ADR-003); a role without the permission is
   * 403 (ADR-020).
   */
  access(user: AuthenticatedUser, siteId: string, permission: Permission): Promise<SiteAccess> {
    return this.accessById(user, toObjectId(siteId, SITE_NOT_FOUND), permission);
  }

  /**
   * Same as `access` for an id that is already parsed, e.g. the `siteId` of an asset or a
   * page. `notFoundTitle` lets the caller answer with the resource the user asked for.
   */
  async accessById(
    user: AuthenticatedUser,
    siteId: ObjectId,
    permission: Permission,
    notFoundTitle = SITE_NOT_FOUND,
  ): Promise<SiteAccess> {
    const ref = await this.sites.findAccessRef(siteId);
    if (!ref) {
      throw notFound(notFoundTitle);
    }
    const scope = await this.accessService.scopeFor(user, ref.workspaceId, notFoundTitle);
    if (!this.accessService.coversSite(scope, ref.id)) {
      throw notFound(notFoundTitle);
    }
    this.accessService.require(scope, permission);
    const site = await this.sites.findById(scope, ref.id);
    if (!site) {
      throw notFound(notFoundTitle);
    }
    return { scope, site };
  }

  availability(subdomain: string): Promise<SubdomainAvailability> {
    return checkSubdomainAvailability(subdomain, (value) => this.sites.subdomainExists(value));
  }

  /** Public origin of the site's default domain, e.g. `https://smilecare.payload.site`. */
  defaultOrigin(site: Pick<SiteRecord, 'subdomain'>): string {
    return siteOrigin(this.env, site.subdomain);
  }

  /**
   * Where the site's pages live for visitors and search engines (ADR-022): its primary custom
   * domain, or the default domain. Canonical URLs, the sitemap and live links use it; previews
   * stay on the default domain.
   */
  publicOrigin(site: Pick<SiteRecord, 'subdomain' | 'primaryDomain'>): string {
    return site.primaryDomain
      ? customDomainOrigin(this.env, site.primaryDomain.hostname)
      : this.defaultOrigin(site);
  }

  toDto(site: SiteRecord): Site {
    return toSiteDto(site, this.defaultOrigin(site), this.publicOrigin(site));
  }
}
