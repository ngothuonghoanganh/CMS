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
  SiteGlobalsSchema,
  SiteGlobalResourceSnapshotSchema,
  SiteDesignSystemSchema,
  DesignTokenUsageQuerySchema,
  type CreateSiteRequest,
  type PaginationQuery,
  type SiteGlobals,
  type SiteGlobalResourceSnapshot,
  type SiteDesignSystem,
  type UpdateSiteRequest,
  type DesignTokenUsageQuery,
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

  @Get(':siteId/globals')
  async getGlobals(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'site.read', workspaceId);
    return this.siteService.getGlobals(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
    );
  }

  @Patch(':siteId/globals')
  async updateGlobals(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @Body(new ZodValidationPipe(SiteGlobalsSchema)) input: SiteGlobals,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'site.update', workspaceId);
    const result = await this.siteService.updateGlobals(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
      input,
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'site.globals.update',
        resourceType: 'site',
        resourceId: siteId,
        workspaceId,
        result: 'success',
        metadata: { changedFields: Object.keys(input) },
      })
      .catch(() => undefined);
    return result;
  }

  @Patch(':siteId/globals/header')
  async updateGlobalHeader(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @Body(new ZodValidationPipe(SiteGlobalResourceSnapshotSchema))
    input: SiteGlobalResourceSnapshot,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'site.update', workspaceId);
    const result = await this.siteService.updateGlobalResource(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
      'header',
      input,
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'site.globals.header.update',
        resourceType: 'site',
        resourceId: siteId,
        workspaceId,
        result: 'success',
      })
      .catch(() => undefined);
    return result;
  }

  @Patch(':siteId/globals/footer')
  async updateGlobalFooter(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @Body(new ZodValidationPipe(SiteGlobalResourceSnapshotSchema))
    input: SiteGlobalResourceSnapshot,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'site.update', workspaceId);
    const result = await this.siteService.updateGlobalResource(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
      'footer',
      input,
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'site.globals.footer.update',
        resourceType: 'site',
        resourceId: siteId,
        workspaceId,
        result: 'success',
      })
      .catch(() => undefined);
    return result;
  }

  @Post(':siteId/globals/header/publish')
  async publishGlobalHeader(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'page.publish', workspaceId);
    const result = await this.siteService.publishGlobalResource(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
      'header',
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'site.globals.header.publish',
        resourceType: 'site',
        resourceId: siteId,
        workspaceId,
        result: 'success',
      })
      .catch(() => undefined);
    return result;
  }

  @Post(':siteId/globals/footer/publish')
  async publishGlobalFooter(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'page.publish', workspaceId);
    const result = await this.siteService.publishGlobalResource(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
      'footer',
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'site.globals.footer.publish',
        resourceType: 'site',
        resourceId: siteId,
        workspaceId,
        result: 'success',
      })
      .catch(() => undefined);
    return result;
  }

  @Post(':siteId/globals/header/discard')
  async discardGlobalHeader(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'site.update', workspaceId);
    return this.siteService.discardGlobalResource(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
      'header',
    );
  }

  @Post(':siteId/globals/footer/discard')
  async discardGlobalFooter(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'site.update', workspaceId);
    return this.siteService.discardGlobalResource(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
      'footer',
    );
  }

  @Get(':siteId/design-system')
  async getDesignSystem(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'design-system.read', workspaceId);
    return this.siteService.getDesignSystem(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
    );
  }

  @Patch(':siteId/design-system')
  async updateDesignSystem(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @Body(new ZodValidationPipe(SiteDesignSystemSchema)) input: SiteDesignSystem,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'design-system.update', workspaceId);
    const result = await this.siteService.updateDesignSystem(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
      input,
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'site.design-system.update',
        resourceType: 'site',
        resourceId: siteId,
        workspaceId,
        result: 'success',
      })
      .catch(() => undefined);
    return result;
  }

  @Get(':siteId/design-system/usage')
  async getDesignTokenUsage(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @Query(new ZodValidationPipe(DesignTokenUsageQuerySchema))
    query: DesignTokenUsageQuery,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'design-system.read', workspaceId);
    return this.siteService.getDesignTokenUsage(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
      query.tokenId,
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
