import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AnalyticsEventV1Schema,
  AnalyticsRangeQuerySchema,
  type AnalyticsEventV1,
  type AnalyticsRangeQuery,
} from '@payload/contracts';
import type { Request } from 'express';

import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import { AuthenticationGuard } from '../common/guards/authentication.guard';
import { requireWorkspaceId } from '../common/guards/workspace-context';
import type { PlatformRequest } from '../common/interfaces/request';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AnalyticsQueryService } from './analytics-query.service';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(
    @Inject(AnalyticsService) private readonly analyticsService: AnalyticsService,
    @Inject(AnalyticsQueryService)
    private readonly queryService: AnalyticsQueryService,
  ) {}

  @Post('events')
  @HttpCode(HttpStatus.ACCEPTED)
  async ingest(
    @Body(new ZodValidationPipe(AnalyticsEventV1Schema)) input: AnalyticsEventV1,
    @Req() request: Request,
  ) {
    const userAgent = request.headers['user-agent'];
    return this.analyticsService.ingestClientEvent(
      input,
      request.ip || request.socket.remoteAddress || 'unknown',
      Array.isArray(userAgent) ? userAgent[0] : userAgent,
    );
  }

  @Get('overview')
  @UseGuards(AuthenticationGuard)
  async overview(
    @Query(new ZodValidationPipe(AnalyticsRangeQuerySchema)) query: AnalyticsRangeQuery,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.queryService.overview(requireWorkspaceId(principal), query);
  }

  @Get('pages/:pageId')
  @UseGuards(AuthenticationGuard)
  async page(
    @Param('pageId') pageId: string,
    @Query(new ZodValidationPipe(AnalyticsRangeQuerySchema)) query: AnalyticsRangeQuery,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.queryService.page(requireWorkspaceId(principal), pageId, query);
  }
}
