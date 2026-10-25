import { Controller, Get, Param, Query } from '@nestjs/common';
import { type AnalyticsReport, analyticsQuerySchema } from '@plp/contracts';
import { ZodPipe } from '../../shared/zod.pipe.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { type AnalyticsReportQuery, AnalyticsReportService } from './analytics-report.service.js';

/** "Hiệu quả" (board 11): members of the site's workspace. */
@Controller()
export class AnalyticsController {
  constructor(private readonly reports: AnalyticsReportService) {}

  @Get('sites/:siteId/analytics')
  report(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Query(new ZodPipe(analyticsQuerySchema)) query: AnalyticsReportQuery,
  ): Promise<AnalyticsReport> {
    return this.reports.report(user, siteId, query);
  }
}
