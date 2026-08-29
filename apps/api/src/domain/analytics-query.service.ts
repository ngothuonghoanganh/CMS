import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import {
  AnalyticsOverviewResponseSchema,
  AnalyticsPageResponseSchema,
  AnalyticsRangeQuerySchema,
  EntityIdSchema,
  type AnalyticsBreakdownItem,
  type AnalyticsMetrics,
  type AnalyticsOverviewResponse,
  type AnalyticsPageResponse,
  type AnalyticsPageSummary,
  type AnalyticsRangeQuery,
  type AnalyticsTimeSeriesPoint,
  normalizePagePath,
} from '@payload/contracts';

import {
  AnalyticsRepository,
  type AnalyticsFilter,
  type AnalyticsPageEventMetrics,
} from './analytics.repository';
import { PageRecord, type PageDocument } from '../persistence/schemas/page.schema';
import { SiteRecord, type SiteDocument } from '../persistence/schemas/site.schema';

const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 366;

@Injectable()
export class AnalyticsQueryService {
  constructor(
    @Inject(AnalyticsRepository)
    private readonly repository: AnalyticsRepository,
    @InjectModel(PageRecord.name)
    private readonly pageModel: Model<PageRecord>,
    @InjectModel(SiteRecord.name)
    private readonly siteModel: Model<SiteRecord>,
  ) {}

  async overview(
    workspaceId: string,
    input: AnalyticsRangeQuery,
  ): Promise<AnalyticsOverviewResponse> {
    const range = resolveRange(input);
    const filter: AnalyticsFilter = { workspaceId, ...range };
    const [report, pageMetrics] = await Promise.all([
      this.buildReport(filter),
      this.repository.pageMetrics(filter),
    ]);
    const topPages = await this.toPageSummaries(workspaceId, pageMetrics, 10);
    return AnalyticsOverviewResponseSchema.parse({ ...report, topPages });
  }

  async page(
    workspaceId: string,
    pageId: string,
    input: AnalyticsRangeQuery,
  ): Promise<AnalyticsPageResponse> {
    const parsedPageId = EntityIdSchema.safeParse(pageId);
    if (!parsedPageId.success) throw this.pageNotFound(pageId);
    const page = await this.pageModel
      .findOne({ _id: parsedPageId.data, workspaceId })
      .exec();
    if (!page) throw this.pageNotFound(pageId);
    const site = await this.siteModel.findOne({ _id: page.siteId, workspaceId }).exec();
    if (!site) throw this.pageNotFound(pageId);

    const range = resolveRange(input);
    const filter: AnalyticsFilter = {
      workspaceId,
      landingPageId: page._id.toString(),
      ...range,
    };
    const [report, pageMetrics] = await Promise.all([
      this.buildReport(filter),
      this.repository.pageMetrics(filter),
    ]);
    const metrics = pageMetrics.find(
      (item) => item.landingPageId === page._id.toString(),
    ) ?? {
      landingPageId: page._id.toString(),
      pageViews: 0,
      sessions: 0,
      submissions: 0,
      ctaClicks: 0,
    };
    const summary = toPageSummary(page, site, metrics);
    return AnalyticsPageResponseSchema.parse({ ...report, page: summary });
  }

  private async buildReport(filter: AnalyticsFilter): Promise<{
    range: { from: string; to: string };
    metrics: AnalyticsMetrics;
    timeline: AnalyticsTimeSeriesPoint[];
    topReferrers: AnalyticsBreakdownItem[];
    topCampaigns: AnalyticsBreakdownItem[];
    deviceBreakdown: AnalyticsBreakdownItem[];
  }> {
    const [
      eventMetrics,
      submissions,
      timeline,
      topReferrers,
      topCampaigns,
      deviceBreakdown,
    ] = await Promise.all([
      this.repository.countMetrics(filter),
      this.repository.countSubmissions(filter),
      this.repository.timeline(filter),
      this.repository.breakdown(filter, 'referrer'),
      this.repository.breakdown(filter, 'campaign'),
      this.repository.breakdown(filter, 'device'),
    ]);
    const metrics = toMetrics({ ...eventMetrics, submissions });
    return {
      range: { from: filter.from.toISOString(), to: filter.to.toISOString() },
      metrics,
      timeline: toTimeline(filter, timeline),
      topReferrers: topReferrers.map(toBreakdownItem),
      topCampaigns: topCampaigns.map(toBreakdownItem),
      deviceBreakdown: deviceBreakdown.map(toBreakdownItem),
    };
  }

  private async toPageSummaries(
    workspaceId: string,
    pageMetrics: AnalyticsPageEventMetrics[],
    limit: number,
  ): Promise<AnalyticsPageSummary[]> {
    const ordered = [...pageMetrics]
      .sort(
        (left, right) =>
          right.pageViews + right.submissions - (left.pageViews + left.submissions),
      )
      .slice(0, limit);
    if (!ordered.length) return [];
    const pageIds = ordered.map((item) => item.landingPageId);
    const pages = await this.pageModel
      .find({ _id: { $in: pageIds }, workspaceId })
      .exec();
    const siteIds = [...new Set(pages.map((page) => page.siteId))];
    const sites = await this.siteModel
      .find({ _id: { $in: siteIds }, workspaceId })
      .exec();
    const siteMap = new Map(sites.map((site) => [site._id.toString(), site]));
    const pageMap = new Map(pages.map((page) => [page._id.toString(), page]));
    return ordered.flatMap((metric) => {
      const page = pageMap.get(metric.landingPageId);
      const site = page ? siteMap.get(page.siteId) : undefined;
      return page && site ? [toPageSummary(page, site, metric)] : [];
    });
  }

  private pageNotFound(pageId: string): NotFoundException {
    return new NotFoundException({
      code: 'ANALYTICS_PAGE_NOT_FOUND',
      message: `Analytics page ${pageId} was not found`,
    });
  }
}

function resolveRange(input: AnalyticsRangeQuery): { from: Date; to: Date } {
  const parsed = AnalyticsRangeQuerySchema.parse(input);
  const to = parsed.to ? new Date(parsed.to) : new Date();
  const from = parsed.from
    ? new Date(parsed.from)
    : new Date(to.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1_000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    throw new BadRequestException({
      code: 'ANALYTICS_RANGE_INVALID',
      message: 'Analytics date range is invalid',
    });
  }
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 24 * 60 * 60 * 1_000) {
    throw new BadRequestException({
      code: 'ANALYTICS_RANGE_TOO_LARGE',
      message: 'Analytics date range cannot exceed 366 days',
    });
  }
  return { from, to };
}

function toMetrics(input: {
  pageViews: number;
  sessions: number;
  submissions: number;
  ctaClicks: number;
}): AnalyticsMetrics {
  return {
    pageViews: input.pageViews,
    sessions: input.sessions,
    submissions: input.submissions,
    ctaClicks: input.ctaClicks,
    conversionRate: input.sessions ? (input.submissions / input.sessions) * 100 : 0,
  };
}

function toPageSummary(
  page: PageDocument,
  site: SiteDocument,
  metric: AnalyticsPageEventMetrics,
): AnalyticsPageSummary {
  const pagePath =
    site.homePageId === page._id.toString()
      ? '/'
      : normalizePagePath(page.path ?? (page.slug ? `/${page.slug}` : '/'));
  return {
    id: page._id.toString(),
    name: page.name,
    siteName: site.name,
    siteSlug: site.slug,
    ...(pagePath ? { pagePath } : {}),
    ...(page.slug ? { slug: page.slug } : {}),
    metrics: toMetrics(metric),
  };
}

function toBreakdownItem(item: {
  name: string;
  pageViews: number;
  sessions: number;
  submissions: number;
}): AnalyticsBreakdownItem {
  return {
    name: item.name.slice(0, 200),
    pageViews: item.pageViews,
    sessions: item.sessions,
    submissions: item.submissions,
  };
}

function toTimeline(
  filter: AnalyticsFilter,
  aggregate: Awaited<ReturnType<AnalyticsRepository['timeline']>>,
): AnalyticsTimeSeriesPoint[] {
  const eventMap = new Map<string, { pageViews: number; ctaClicks: number }>();
  for (const row of aggregate.events) {
    const current = eventMap.get(row.date) ?? { pageViews: 0, ctaClicks: 0 };
    if (row.eventType === 'page.viewed') current.pageViews = row.count;
    if (row.eventType === 'element.clicked') current.ctaClicks = row.count;
    eventMap.set(row.date, current);
  }
  const sessionMap = new Map(aggregate.sessions.map((row) => [row.date, row.count]));
  const submissionMap = new Map(
    aggregate.submissions.map((row) => [row.date, row.count]),
  );
  const points: AnalyticsTimeSeriesPoint[] = [];
  const cursor = new Date(
    Date.UTC(
      filter.from.getUTCFullYear(),
      filter.from.getUTCMonth(),
      filter.from.getUTCDate(),
    ),
  );
  while (cursor < filter.to) {
    const date = cursor.toISOString().slice(0, 10);
    const event = eventMap.get(date) ?? { pageViews: 0, ctaClicks: 0 };
    const sessions = sessionMap.get(date) ?? 0;
    const submissions = submissionMap.get(date) ?? 0;
    points.push({
      date,
      pageViews: event.pageViews,
      sessions,
      submissions,
      conversionRate: sessions ? (submissions / sessions) * 100 : 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return points;
}
