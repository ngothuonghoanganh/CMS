import { Injectable } from '@nestjs/common';
import type { Site, SiteListResponse, SubdomainAvailability } from '@plp/contracts';
import { type Env, siteOrigin } from '../../config/env.js';
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
export const WORKSPACE_NOT_FOUND = 'Không tìm thấy workspace';

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
   * membership in the site's workspace and loads the site. An unknown site and a site of another
   * workspace are both 404 "Không tìm thấy site" (ADR-003).
   */
  access(user: AuthenticatedUser, siteId: string): Promise<SiteAccess> {
    return this.accessById(user, toObjectId(siteId, SITE_NOT_FOUND));
  }

  /**
   * Same as `access` for an id that is already parsed, e.g. the `siteId` of an asset or a
   * page. `notFoundTitle` lets the caller answer with the resource the user asked for.
   */
  async accessById(
    user: AuthenticatedUser,
    siteId: ObjectId,
    notFoundTitle = SITE_NOT_FOUND,
  ): Promise<SiteAccess> {
    const ref = await this.sites.findAccessRef(siteId);
    if (!ref) {
      throw notFound(notFoundTitle);
    }
    const scope = await this.accessService.scopeFor(user, ref.workspaceId, notFoundTitle);
    const site = await this.sites.findById(scope, ref.id);
    if (!site) {
      throw notFound(notFoundTitle);
    }
    return { scope, site };
  }

  /** Scope of a workspace from the URL; non-members get 404. */
  scopeForWorkspace(user: AuthenticatedUser, workspaceId: string): Promise<WorkspaceScope> {
    return this.accessService.scopeFor(
      user,
      toObjectId(workspaceId, WORKSPACE_NOT_FOUND),
      WORKSPACE_NOT_FOUND,
    );
  }

  async listForWorkspace(user: AuthenticatedUser, workspaceId: string): Promise<SiteListResponse> {
    const scope = await this.scopeForWorkspace(user, workspaceId);
    const sites = await this.sites.listForWorkspace(scope);
    return { items: sites.map((site) => this.toDto(site)) };
  }

  availability(subdomain: string): Promise<SubdomainAvailability> {
    return checkSubdomainAvailability(subdomain, (value) => this.sites.subdomainExists(value));
  }

  /** Public origin of the site's default domain, e.g. `https://smilecare.payload.site`. */
  defaultOrigin(site: Pick<SiteRecord, 'subdomain'>): string {
    return siteOrigin(this.env, site.subdomain);
  }

  toDto(site: SiteRecord): Site {
    return toSiteDto(site, this.defaultOrigin(site));
  }
}
