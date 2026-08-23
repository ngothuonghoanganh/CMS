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
  UpdatePageRequestSchema,
  PaginationQuerySchema,
  PublishPageRequestSchema,
  type CreatePageRequest,
  type CreatePageVersionRequest,
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

@Controller('sites/:siteId/pages')
@UseGuards(AuthenticationGuard)
export class SitePagesController {
  constructor(@Inject(PageService) private readonly pageService: PageService) {}

  @Post()
  async create(
    @Param('siteId') siteId: string,
    @Body(new ZodValidationPipe(CreatePageRequestSchema)) input: CreatePageRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.pageService.create(siteId, input, requireWorkspaceId(principal));
  }

  @Get()
  async list(
    @Param('siteId') siteId: string,
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.pageService.listBySite(siteId, query, requireWorkspaceId(principal));
  }
}

@Controller('pages')
@UseGuards(AuthenticationGuard)
export class PageController {
  constructor(@Inject(PageService) private readonly pageService: PageService) {}

  @Get(':pageId')
  async get(
    @Param('pageId') pageId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.pageService.getById(pageId, requireWorkspaceId(principal));
  }

  @Patch(':pageId')
  async update(
    @Param('pageId') pageId: string,
    @Body(new ZodValidationPipe(UpdatePageRequestSchema)) input: UpdatePageRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.pageService.update(pageId, input, requireWorkspaceId(principal));
  }

  @Delete(':pageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('pageId') pageId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ): Promise<void> {
    await this.pageService.remove(pageId, requireWorkspaceId(principal));
  }

  @Post(':pageId/versions')
  async createVersion(
    @Param('pageId') pageId: string,
    @Body(new ZodValidationPipe(CreatePageVersionRequestSchema))
    input: CreatePageVersionRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.pageService.createVersion(pageId, input, requireWorkspaceId(principal));
  }

  @Post(':pageId/publish')
  async publish(
    @Param('pageId') pageId: string,
    @Body(new ZodValidationPipe(PublishPageRequestSchema)) input: PublishPageRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.pageService.publish(pageId, input, requireWorkspaceId(principal));
  }

  @Post(':pageId/unpublish')
  async unpublish(
    @Param('pageId') pageId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.pageService.unpublish(pageId, requireWorkspaceId(principal));
  }

  @Get(':pageId/versions')
  async listVersions(
    @Param('pageId') pageId: string,
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.pageService.listVersions(pageId, query, requireWorkspaceId(principal));
  }

  @Get(':pageId/versions/:versionNumber')
  async getVersion(
    @Param('pageId') pageId: string,
    @Param('versionNumber', ParseIntPipe) versionNumber: number,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
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
}

@Controller('preview/pages')
@UseGuards(AuthenticationGuard)
export class PreviewPageController {
  constructor(@Inject(PageService) private readonly pageService: PageService) {}

  @Get(':pageId')
  async getPreviewPage(
    @Param('pageId') pageId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.pageService.resolvePreview(pageId, requireWorkspaceId(principal));
  }
}
