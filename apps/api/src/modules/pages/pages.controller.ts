import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
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
} from '@plp/contracts';
import { ZodPipe } from '../../shared/zod.pipe.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import {
  type CreatePageValues,
  type PageListQueryValues,
  PagesService,
  type SlugAvailabilityQuery,
} from './pages.service.js';

@Controller()
export class PagesController {
  constructor(private readonly pages: PagesService) {}

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

  @Get('pages/:pageId')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pageId') pageId: string,
  ): Promise<PageDetailResponse> {
    return this.pages.get(user, pageId);
  }

  @Put('pages/:pageId/draft')
  saveDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pageId') pageId: string,
    @Body(new ZodPipe(saveDraftRequestSchema)) body: SaveDraftRequest,
  ): Promise<SaveDraftResponse> {
    return this.pages.saveDraft(user, pageId, body);
  }

  @Post('pages/:pageId/draft/restore')
  @HttpCode(200)
  restoreDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pageId') pageId: string,
    @Body(new ZodPipe(restoreDraftRequestSchema)) body: RestoreDraftRequest,
  ): Promise<PageDetailResponse> {
    return this.pages.restoreDraft(user, pageId, body);
  }
}
