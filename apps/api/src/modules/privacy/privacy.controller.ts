import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import {
  type ConsentVersion,
  type ConsentVersionListResponse,
  consentVersionListQuerySchema,
  type CreateConsentVersionRequest,
  createConsentVersionRequestSchema,
  type CursorQuery,
  type PrivacySettings,
  updatePrivacyRequestSchema,
} from '@plp/contracts';
import { ZodPipe } from '../../shared/zod.pipe.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { PrivacyService, type UpdatePrivacyValues } from './privacy.service.js';

/** "Dữ liệu & đồng ý" (ADR-017): members read, the owner writes. */
@Controller()
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get('sites/:siteId/privacy')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
  ): Promise<PrivacySettings> {
    return this.privacy.get(user, siteId);
  }

  @Put('sites/:siteId/privacy')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Body(new ZodPipe(updatePrivacyRequestSchema)) body: UpdatePrivacyValues,
  ): Promise<PrivacySettings> {
    return this.privacy.update(user, siteId, body);
  }

  @Get('sites/:siteId/consent-versions')
  listVersions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Query(new ZodPipe(consentVersionListQuerySchema)) query: CursorQuery,
  ): Promise<ConsentVersionListResponse> {
    return this.privacy.listVersions(user, siteId, query);
  }

  @Post('sites/:siteId/consent-versions')
  createVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Body(new ZodPipe(createConsentVersionRequestSchema)) body: CreateConsentVersionRequest,
  ): Promise<ConsentVersion> {
    return this.privacy.createVersion(user, siteId, body);
  }
}
