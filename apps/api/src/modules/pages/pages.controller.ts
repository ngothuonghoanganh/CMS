import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  type ApplyTemplateRequest,
  applyTemplateRequestSchema,
  createPageRequestSchema,
  type PageCountResponse,
  type PageDetailResponse,
  type PageListResponse,
  pageListQuerySchema,
  type PageRefListResponse,
  type RestoreDraftRequest,
  restoreDraftRequestSchema,
  type SaveDraftRequest,
  saveDraftRequestSchema,
  type SaveDraftResponse,
  type SlugAvailability,
  slugAvailabilityQuerySchema,
  type TemplateCompositionResponse,
  type TemplateRef,
  templateRefSchema,
} from '@plp/contracts';
import { ZodPipe } from '../../shared/zod.pipe.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { PageDeletionService } from './page-deletion.service.js';
import { PageTemplatesService } from './page-templates.service.js';
import {
  type CreatePageValues,
  type PageListQueryValues,
  PagesService,
  type SlugAvailabilityQuery,
} from './pages.service.js';

@Controller()
export class PagesController {
  constructor(
    private readonly pages: PagesService,
    private readonly deletion: PageDeletionService,
    private readonly templates: PageTemplatesService,
  ) {}

  @Get('sites/:siteId/pages')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Query(new ZodPipe(pageListQuerySchema)) query: PageListQueryValues,
  ): Promise<PageListResponse> {
    return this.pages.list(user, siteId, query);
  }

  @Get('sites/:siteId/page-refs')
  listRefs(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
  ): Promise<PageRefListResponse> {
    return this.pages.listRefs(user, siteId);
  }

  @Get('sites/:siteId/page-count')
  count(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
  ): Promise<PageCountResponse> {
    return this.pages.count(user, siteId);
  }

  @Post('sites/:siteId/pages')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Body(new ZodPipe(createPageRequestSchema)) body: CreatePageValues,
  ): Promise<PageDetailResponse> {
    return this.pages.create(user, siteId, body);
  }

  @Get('sites/:siteId/slug-availability')
  slugAvailability(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Query(new ZodPipe(slugAvailabilityQuerySchema)) query: SlugAvailabilityQuery,
  ): Promise<SlugAvailability> {
    return this.pages.slugAvailability(user, siteId, query);
  }

  @Get('sites/:siteId/pages/:pageId')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('pageId') pageId: string,
  ): Promise<PageDetailResponse> {
    return this.pages.get(user, siteId, pageId);
  }

  /** "Xóa trang" (ADR-027): only a page that is not live. */
  @Delete('sites/:siteId/pages/:pageId')
  @HttpCode(204)
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('pageId') pageId: string,
  ): Promise<void> {
    return this.deletion.delete(user, siteId, pageId);
  }

  @Put('sites/:siteId/pages/:pageId/draft')
  saveDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('pageId') pageId: string,
    @Body(new ZodPipe(saveDraftRequestSchema)) body: SaveDraftRequest,
  ): Promise<SaveDraftResponse> {
    return this.pages.saveDraft(user, siteId, pageId, body);
  }

  @Post('sites/:siteId/pages/:pageId/draft/restore')
  @HttpCode(200)
  restoreDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('pageId') pageId: string,
    @Body(new ZodPipe(restoreDraftRequestSchema)) body: RestoreDraftRequest,
  ): Promise<PageDetailResponse> {
    return this.pages.restoreDraft(user, siteId, pageId, body);
  }

  /** "Áp dụng vào trang đang sửa…" (board 18, ADR-030). */
  @Post('sites/:siteId/pages/:pageId/draft/template')
  @HttpCode(200)
  applyTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('pageId') pageId: string,
    @Body(new ZodPipe(applyTemplateRequestSchema)) body: ApplyTemplateRequest,
  ): Promise<PageDetailResponse> {
    return this.templates.apply(user, siteId, pageId, body);
  }

  /** "Áp dụng mẫu…" of the editor (ADR-030): nothing is saved here. */
  @Post('sites/:siteId/pages/:pageId/template-composition')
  @HttpCode(200)
  templateComposition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('pageId') pageId: string,
    @Body(new ZodPipe(templateRefSchema)) body: TemplateRef,
  ): Promise<TemplateCompositionResponse> {
    return this.templates.composition(user, siteId, pageId, body);
  }
}
