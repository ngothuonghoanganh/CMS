import { Injectable } from '@nestjs/common';
import { can, recentDaysWindow, type SiteListResponse } from '@plp/contracts';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { LeadsRepository } from '../leads/leads.repository.js';
import { PagesRepository } from '../pages/pages.repository.js';
import { AccessService } from '../workspaces/access.service.js';
import { toSiteSummary } from './site-dto.js';
import { SitesRepository } from './sites.repository.js';
import { SitesService } from './sites.service.js';

/**
 * The sites of a workspace, for the site switcher and the Sites screen (ADR-028). Pages and leads
 * are counted for every site at once, one aggregation each, so the cost does not grow with the
 * number of sites.
 */
@Injectable()
export class SiteListService {
  constructor(
    private readonly access: AccessService,
    private readonly sitesRepository: SitesRepository,
    private readonly sites: SitesService,
    private readonly pages: PagesRepository,
    private readonly leads: LeadsRepository,
  ) {}

  /** The sites the member may open (ADR-020), oldest first, each with its counts. */
  async list(user: AuthenticatedUser, workspaceId: string): Promise<SiteListResponse> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    const sites = (await this.sitesRepository.listForWorkspace(scope)).filter((site) =>
      this.access.coversSite(scope, site._id),
    );
    const siteIds = sites.map((site) => site._id);
    // Lead counts are for the roles that see leads (ADR-024).
    const [pageCounts, recentLeads] = await Promise.all([
      this.pages.countBySite(scope, siteIds),
      can(scope.access, 'leads.view')
        ? this.leads.countRecentBySite(scope, siteIds, recentDaysWindow(new Date(), 7))
        : null,
    ]);
    return {
      items: sites.map((site) => ({
        ...this.sites.toDto(site),
        summary: toSiteSummary(site._id.toHexString(), pageCounts, recentLeads),
      })),
    };
  }
}
