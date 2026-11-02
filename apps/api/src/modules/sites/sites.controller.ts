import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  createSiteRequestSchema,
  type DeleteSiteRequest,
  deleteSiteRequestSchema,
  type Site,
  type SiteDeletionSummary,
  type SiteListResponse,
  type SubdomainAvailability,
  subdomainAvailabilityQuerySchema,
  type UpdateSiteRequest,
  updateSiteRequestSchema,
} from '@plp/contracts';
import type { z } from 'zod';
import { ZodPipe } from '../../shared/zod.pipe.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { SiteDeletionService } from './site-deletion.service.js';
import { type CreateSiteValues, SiteManagementService } from './site-management.service.js';
import { SitesService } from './sites.service.js';

type SubdomainAvailabilityQuery = z.output<typeof subdomainAvailabilityQuerySchema>;

@Controller()
export class SitesController {
  constructor(
    private readonly sites: SitesService,
    private readonly management: SiteManagementService,
    private readonly deletion: SiteDeletionService,
  ) {}

  @Get('workspaces/:workspaceId/sites')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
  ): Promise<SiteListResponse> {
    return this.sites.listForWorkspace(user, workspaceId);
  }

  @Post('workspaces/:workspaceId/sites')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Body(new ZodPipe(createSiteRequestSchema)) body: CreateSiteValues,
  ): Promise<Site> {
    return this.management.create(user, workspaceId, body);
  }

  // Declared before `sites/:siteId` so the static segment is matched first.
  @Get('sites/subdomain-availability')
  availability(
    @Query(new ZodPipe(subdomainAvailabilityQuerySchema)) query: SubdomainAvailabilityQuery,
  ): Promise<SubdomainAvailability> {
    return this.sites.availability(query.subdomain);
  }

  @Get('sites/:siteId')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
  ): Promise<Site> {
    const { site } = await this.sites.access(user, siteId, 'pages.view');
    return this.sites.toDto(site);
  }

  @Get('sites/:siteId/deletion-summary')
  deletionSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
  ): Promise<SiteDeletionSummary> {
    return this.deletion.summary(user, siteId);
  }

  /** "Xóa site" (ADR-027): the site's name typed again in the body. */
  @Delete('sites/:siteId')
  @HttpCode(204)
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Body(new ZodPipe(deleteSiteRequestSchema)) body: DeleteSiteRequest,
  ): Promise<void> {
    return this.deletion.delete(user, siteId, body);
  }

  @Patch('sites/:siteId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Body(new ZodPipe(updateSiteRequestSchema)) body: UpdateSiteRequest,
  ): Promise<Site> {
    return this.management.update(user, siteId, body);
  }
}
