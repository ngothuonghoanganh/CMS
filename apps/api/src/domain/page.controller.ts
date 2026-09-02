import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CreatePageRequestSchema,
  CreatePageVersionRequestSchema,
  DuplicatePageRequestSchema,
  PageLayoutUpdateRequestSchema,
  UpdatePageRequestSchema,
  PaginationQuerySchema,
  PublishPageRequestSchema,
  type CreatePageRequest,
  type CreatePageVersionRequest,
  type DuplicatePageRequest,
  type PageLayoutUpdateRequest,
  type PaginationQuery,
  type PublishPageRequest,
  type UpdatePageRequest,
} from '@payload/contracts';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import { AuthenticationGuard } from '../common/guards/authentication.guard';
import { requireWorkspaceId } from '../common/guards/workspace-context';
import type { PlatformRequest } from '../common/interfaces/request';
import { PageService } from './page.service';
import { AuthorizationService } from '../security/authorization.service';
import { AuditService } from '../security/audit.service';

@Controller('sites/:siteId/pages')
@UseGuards(AuthenticationGuard)
export class SitePagesController {
  constructor(
    @Inject(PageService) private readonly pageService: PageService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Post()
  async create(
    @Param('siteId') siteId: string,
    @Body(new ZodValidationPipe(CreatePageRequestSchema)) input: CreatePageRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'page.create');
    const result = await this.pageService.create(
      siteId,
      input,
      requireWorkspaceId(principal),
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'page.create',
        resourceType: 'page',
        resourceId: result.id,
        ...(principal?.workspaceId ? { workspaceId: principal.workspaceId } : {}),
        result: 'success',
      })
      .catch(() => undefined);
    return result;
  }

  @Get()
  async list(
    @Param('siteId') siteId: string,
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'page.read');
    return this.pageService.listBySite(siteId, query, requireWorkspaceId(principal));
  }
}

@Controller('pages')
@UseGuards(AuthenticationGuard)
export class PageController {
  constructor(
    @Inject(PageService) private readonly pageService: PageService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get(':pageId')
  async get(
    @Param('pageId') pageId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'page.read');
    return this.pageService.getById(pageId, requireWorkspaceId(principal));
  }

  @Patch(':pageId')
  async update(
    @Param('pageId') pageId: string,
    @Body(new ZodValidationPipe(UpdatePageRequestSchema)) input: UpdatePageRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'page.update');
    const result = await this.pageService.update(
      pageId,
      input,
      requireWorkspaceId(principal),
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'page.update',
        resourceType: 'page',
        resourceId: pageId,
        ...(principal?.workspaceId ? { workspaceId: principal.workspaceId } : {}),
        result: 'success',
        metadata: { changedFields: Object.keys(input) },
      })
      .catch(() => undefined);
    return result;
  }

  @Delete(':pageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('pageId') pageId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ): Promise<void> {
    await this.authorization.assertCan(principal, 'page.delete');
    await this.pageService.remove(pageId, requireWorkspaceId(principal));
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'page.delete',
        resourceType: 'page',
        resourceId: pageId,
        ...(principal?.workspaceId ? { workspaceId: principal.workspaceId } : {}),
        result: 'success',
      })
      .catch(() => undefined);
  }

  @Post(':pageId/duplicate')
  async duplicate(
    @Param('pageId') pageId: string,
    @Body(new ZodValidationPipe(DuplicatePageRequestSchema))
    input: DuplicatePageRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'page.create');
    return this.pageService.duplicate(pageId, input, requireWorkspaceId(principal));
  }

  @Post(':pageId/homepage')
  async setHomepage(
    @Param('pageId') pageId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'site.update');
    return this.pageService.setHomepage(pageId, requireWorkspaceId(principal));
  }

  /**
   * Header and Footer are an explicit page composition concern. Keeping this
   * endpoint beside page metadata makes it possible for the CMS to attach a
   * layout resource without serialising it into the page payload.
   */
  @Get(':pageId/layout')
  async getLayout(
    @Param('pageId') pageId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'page.read');
    return {
      attachments: await this.pageService.getLayout(
        pageId,
        requireWorkspaceId(principal),
      ),
    };
  }

  @Patch(':pageId/layout')
  async updateLayout(
    @Param('pageId') pageId: string,
    @Body(new ZodValidationPipe(PageLayoutUpdateRequestSchema))
    input: PageLayoutUpdateRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'page.update');
    const attachments = await this.pageService.updateLayout(
      pageId,
      input.attachments,
      requireWorkspaceId(principal),
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'page.layout.update',
        resourceType: 'page',
        resourceId: pageId,
        ...(principal?.workspaceId ? { workspaceId: principal.workspaceId } : {}),
        result: 'success',
        metadata: { attachmentCount: attachments.length },
      })
      .catch(() => undefined);
    return { attachments };
  }

  @Post(':pageId/versions')
  async createVersion(
    @Param('pageId') pageId: string,
    @Body(new ZodValidationPipe(CreatePageVersionRequestSchema))
    input: CreatePageVersionRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'page.update');
    const result = await this.pageService.createVersion(
      pageId,
      input,
      requireWorkspaceId(principal),
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'page.update',
        resourceType: 'page_version',
        resourceId: result.id,
        ...(principal?.workspaceId ? { workspaceId: principal.workspaceId } : {}),
        result: 'success',
        metadata: { pageId, versionNumber: result.versionNumber },
      })
      .catch(() => undefined);
    return result;
  }

  @Post(':pageId/publish')
  async publish(
    @Param('pageId') pageId: string,
    @Body(new ZodValidationPipe(PublishPageRequestSchema)) input: PublishPageRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'page.publish');
    const result = await this.pageService.publish(
      pageId,
      input,
      requireWorkspaceId(principal),
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'page.publish',
        resourceType: 'page',
        resourceId: pageId,
        ...(principal?.workspaceId ? { workspaceId: principal.workspaceId } : {}),
        result: 'success',
        metadata: { versionNumber: input.versionNumber },
      })
      .catch(() => undefined);
    return result;
  }

  @Post(':pageId/unpublish')
  async unpublish(
    @Param('pageId') pageId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'page.publish');
    const result = await this.pageService.unpublish(
      pageId,
      requireWorkspaceId(principal),
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'page.publish',
        resourceType: 'page',
        resourceId: pageId,
        ...(principal?.workspaceId ? { workspaceId: principal.workspaceId } : {}),
        result: 'success',
        metadata: { action: 'unpublish' },
      })
      .catch(() => undefined);
    return result;
  }

  @Get(':pageId/versions')
  async listVersions(
    @Param('pageId') pageId: string,
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'page.read');
    return this.pageService.listVersions(pageId, query, requireWorkspaceId(principal));
  }

  @Get(':pageId/versions/:versionNumber')
  async getVersion(
    @Param('pageId') pageId: string,
    @Param('versionNumber', ParseIntPipe) versionNumber: number,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'page.read');
    return this.pageService.getVersion(
      pageId,
      versionNumber,
      requireWorkspaceId(principal),
    );
  }
}

@Controller('public/sites')
export class PublicPageController {
  constructor(@Inject(PageService) private readonly pageService: PageService) {}

  @Get(':siteSlug/pages/:pageSlug')
  async getPublicPage(
    @Param('siteSlug') siteSlug: string,
    @Param('pageSlug') pageSlug: string,
  ) {
    return this.pageService.resolvePublicPage(siteSlug, pageSlug);
  }

  @Get(':siteSlug')
  async getPublicHomePage(@Param('siteSlug') siteSlug: string) {
    return this.pageService.resolvePublicPageByPath(siteSlug, '/');
  }

  @Get(':siteSlug/resolve')
  async resolvePublicPage(
    @Param('siteSlug') siteSlug: string,
    @Query('path') path = '/',
  ) {
    return this.pageService.resolvePublicPageByPath(siteSlug, path);
  }
}

@Controller('preview/pages')
@UseGuards(AuthenticationGuard)
export class PreviewPageController {
  constructor(
    @Inject(PageService) private readonly pageService: PageService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
  ) {}

  @Get(':pageId')
  async getPreviewPage(
    @Param('pageId') pageId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'page.read');
    return this.pageService.resolvePreview(pageId, requireWorkspaceId(principal));
  }
}
