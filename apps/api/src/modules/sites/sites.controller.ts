import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  createSiteRequestSchema,
  type Site,
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
import { type CreateSiteValues, SiteManagementService } from './site-management.service.js';
import { SitesService } from './sites.service.js';

type SubdomainAvailabilityQuery = z.output<typeof subdomainAvailabilityQuerySchema>;

@Controller()
export class SitesController {
  constructor(
    private readonly sites: SitesService,
    private readonly management: SiteManagementService,
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
    const { site } = await this.sites.access(user, siteId);
    return this.sites.toDto(site);
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
