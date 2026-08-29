import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CreateSiteRequestSchema,
  PaginationQuerySchema,
  UpdateSiteRequestSchema,
  type CreateSiteRequest,
  type PaginationQuery,
  type UpdateSiteRequest,
} from '@payload/contracts';

import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import { AuthenticationGuard } from '../common/guards/authentication.guard';
import { requireRequestedWorkspace } from '../common/guards/workspace-context';
import type { PlatformRequest } from '../common/interfaces/request';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { SiteService } from './site.service';
import { AuthorizationService } from '../security/authorization.service';
import { AuditService } from '../security/audit.service';

@Controller('workspaces/:workspaceId/sites')
@UseGuards(AuthenticationGuard)
export class SiteController {
  constructor(
    @Inject(SiteService) private readonly siteService: SiteService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Post()
  async create(
    @Param('workspaceId') workspaceId: string,
    @Body(new ZodValidationPipe(CreateSiteRequestSchema)) input: CreateSiteRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'site.create', workspaceId);
    const result = await this.siteService.create(
      requireRequestedWorkspace(principal, workspaceId),
      input,
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'site.create',
        resourceType: 'site',
        resourceId: result.id,
        workspaceId,
        result: 'success',
        metadata: { slug: result.slug },
      })
      .catch(() => undefined);
    return result;
  }

  @Get()
  async list(
    @Param('workspaceId') workspaceId: string,
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'site.read', workspaceId);
    return this.siteService.list(
      requireRequestedWorkspace(principal, workspaceId),
      query,
    );
  }

  @Get(':siteId')
  async get(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'site.read', workspaceId);
    return this.siteService.getById(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
    );
  }

  @Get(':siteId/url')
  async getOfficialUrl(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'site.read', workspaceId);
    return this.siteService.getOfficialUrl(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
    );
  }

  @Get(':siteId/manifest')
  async getManifest(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'site.read', workspaceId);
    return this.siteService.getManifest(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
    );
  }

  @Patch(':siteId')
  async update(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @Body(new ZodValidationPipe(UpdateSiteRequestSchema)) input: UpdateSiteRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'site.update', workspaceId);
    const result = await this.siteService.update(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
      input,
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'site.update',
        resourceType: 'site',
        resourceId: siteId,
        workspaceId,
        result: 'success',
        metadata: { changedFields: Object.keys(input) },
      })
      .catch(() => undefined);
    return result;
  }

  @Post(':siteId/publish')
  async publish(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'page.publish', workspaceId);
    const result = await this.siteService.publish(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'site.publish',
        resourceType: 'site',
        resourceId: siteId,
        workspaceId,
        result: 'success',
      })
      .catch(() => undefined);
    return result;
  }
}
