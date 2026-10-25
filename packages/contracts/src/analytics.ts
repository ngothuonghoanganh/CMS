import { z } from 'zod';
import { vnDaySchema } from './calendar.js';
import { idSchema } from './common.js';
import { leadPageRefSchema, leadSourceLabel } from './lead-inbox.js';

/**
 * "Hiệu quả" (board 11, ADR-019): page views counted without cookies. The live page's script sends
 * one view per load to the renderer, which relays it signed to the API; unique visitors are a
 * daily salted hash, and only daily totals are stored.
 */

const sourceValueSchema = z.string().max(500).nullable();

export const pageViewSchema = z.object({
  /** The page's path as the visitor's browser shows it: "/" or "/uu-dai". */
  path: z.string().min(1).max(512).startsWith('/'),
  /** Campaign tags of the page's address, and the page the visitor came from. */
  source: z.object({
    utmSource: sourceValueSchema,
    utmMedium: sourceValueSchema,
    utmCampaign: sourceValueSchema,
    referrer: z.string().max(1000).nullable(),
  }),
});
export type PageView = z.infer<typeof pageViewSchema>;

/** Daily totals are kept 13 months, then removed by their TTL index. */
export const ANALYTICS_RETENTION_DAYS = 400;

/**
 * Source/medium pairs a site keeps per day; later pairs that day are counted as "khác", so one
 * site cannot grow its totals without bound (ADR-019).
 */
export const ANALYTICS_SOURCE_PAIRS_PER_DAY = 50;
export const ANALYTICS_OTHER_SOURCE = { source: '(other)', medium: '(other)' } as const;

/** Rows of "Theo nguồn truy cập", by visitors. */
export const ANALYTICS_SOURCES_SHOWN = 20;

/** "facebook / cpc", "trực tiếp", or "khác" for the pairs past the daily cap. */
export function analyticsSourceLabel(source: { source: string; medium: string }): string {
  return source.source === ANALYTICS_OTHER_SOURCE.source &&
    source.medium === ANALYTICS_OTHER_SOURCE.medium
    ? 'khác'
    : leadSourceLabel(source);
}

export const analyticsRanges = ['7d', '30d', '90d'] as const;
export const analyticsRangeSchema = z.enum(analyticsRanges);
export type AnalyticsRange = z.infer<typeof analyticsRangeSchema>;
export const DEFAULT_ANALYTICS_RANGE: AnalyticsRange = '7d';

/** Days of each range: today in Vietnam and the days before it, like the lead inbox. */
export const analyticsRangeDays: Record<AnalyticsRange, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

/** Query of `GET /sites/:siteId/analytics`: the range and, optionally, one page. */
export const analyticsQuerySchema = z.strictObject({
  range: analyticsRangeSchema.default(DEFAULT_ANALYTICS_RANGE),
  pageId: idSchema.optional(),
});
export type AnalyticsQuery = z.input<typeof analyticsQuerySchema>;

const countSchema = z.number().int().nonnegative();

/** Views, unique visitors (the sum of each day's) and leads not suspected of spam. */
export const analyticsTotalsSchema = z.object({
  views: countSchema,
  visitors: countSchema,
  leads: countSchema,
});
export type AnalyticsTotals = z.infer<typeof analyticsTotalsSchema>;

export const analyticsPeriodSchema = z.object({ from: vnDaySchema, to: vnDaySchema });
export type AnalyticsPeriod = z.infer<typeof analyticsPeriodSchema>;

export const analyticsReportSchema = z.object({
  period: analyticsPeriodSchema,
  /** The same number of days just before: "7 ngày trước: 2.870". */
  previousPeriod: analyticsPeriodSchema,
  totals: analyticsTotalsSchema,
  previousTotals: analyticsTotalsSchema,
  /** Every day of the period, oldest first; days without views are zeros. */
  daily: z.array(
    z.object({ day: vnDaySchema, views: countSchema, visitors: countSchema, leads: countSchema }),
  ),
  /** At most `ANALYTICS_SOURCES_SHOWN` source/medium pairs, most visitors first. */
  sources: z.array(
    z.object({
      source: z.string(),
      medium: z.string(),
      visitors: countSchema,
      leads: countSchema,
    }),
  ),
  /** Pages with visitors or leads in the period, most leads first. */
  pages: z.array(z.object({ page: leadPageRefSchema, visitors: countSchema, leads: countSchema })),
  /** Unique visitors by device. */
  devices: z.object({ mobile: countSchema, desktop: countSchema }),
});
export type AnalyticsReport = z.infer<typeof analyticsReportSchema>;
