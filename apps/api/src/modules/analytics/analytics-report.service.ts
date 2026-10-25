import { Injectable } from '@nestjs/common';
import {
  addVnDays,
  type AnalyticsRange,
  analyticsRangeDays,
  type AnalyticsReport,
  vnDayOf,
  vnDayStart,
  vnDaysWindow,
} from '@plp/contracts';
import { toObjectId } from '../../shared/persistence/object-id.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { LeadsRepository } from '../leads/leads.repository.js';
import { PagesRepository } from '../pages/pages.repository.js';
import { SitesService } from '../sites/sites.service.js';
import { AnalyticsRepository } from './analytics.repository.js';
import { buildAnalyticsReport } from './domain/report.js';

/** Query of the report after the contract schema applied its defaults. */
export interface AnalyticsReportQuery {
  range: AnalyticsRange;
  pageId?: string | undefined;
}

const PAGE_NOT_FOUND = 'Không tìm thấy trang';

/**
 * "Hiệu quả" (board 11, ADR-019) for every member: the period's views, unique visitors and leads
 * against the period just before, per day, source, page and device. Three aggregations and one
 * title lookup, whatever the range.
 */
@Injectable()
export class AnalyticsReportService {
  constructor(
    private readonly sites: SitesService,
    private readonly analytics: AnalyticsRepository,
    private readonly leads: LeadsRepository,
    private readonly pages: PagesRepository,
  ) {}

  async report(
    user: AuthenticatedUser,
    siteId: string,
    query: AnalyticsReportQuery,
  ): Promise<AnalyticsReport> {
    const { scope, site } = await this.sites.access(user, siteId);
    // A page of another site matches no row: its report is empty, never someone else's.
    const pageId = query.pageId === undefined ? null : toObjectId(query.pageId, PAGE_NOT_FOUND);
    const days = analyticsRangeDays[query.range];
    const today = vnDayOf(new Date());
    const period = { from: addVnDays(today, 1 - days), to: today };
    const previousPeriod = { from: addVnDays(period.from, -days), to: addVnDays(period.from, -1) };
    const [views, pageVisitors, leads] = await Promise.all([
      this.analytics.viewRows(scope, site._id, pageId, {
        from: previousPeriod.from,
        to: period.to,
        currentFrom: period.from,
      }),
      pageId === null
        ? this.analytics.pageVisitors(scope, site._id, period.from, period.to)
        : Promise.resolve([]),
      this.leads.analyticsRows(
        scope,
        site._id,
        pageId,
        vnDaysWindow(previousPeriod.from, period.to),
        vnDayStart(period.from),
      ),
    ]);
    const pageIds = new Set([
      ...pageVisitors.map((row) => row.pageId),
      ...leads.pages.map((row) => row.pageId),
    ]);
    const titles =
      pageId === null && pageIds.size > 0
        ? await this.pages.findTitles(
            scope,
            [...pageIds].map((id) => toObjectId(id)),
          )
        : new Map<string, string>();
    return buildAnalyticsReport({
      period,
      previousPeriod,
      views,
      pageVisitors,
      leads,
      titles,
      onePage: pageId !== null,
    });
  }
}
