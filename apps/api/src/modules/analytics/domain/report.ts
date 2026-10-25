import {
  addVnDays,
  ANALYTICS_SOURCES_SHOWN,
  type AnalyticsPeriod,
  type AnalyticsReport,
  type AnalyticsTotals,
  type LeadDevice,
  type VnDay,
  vnDaySpan,
} from '@plp/contracts';
import type { LeadAnalyticsRows } from '../../leads/leads.repository.js';

/** Views of the site, or of one page, as the daily totals hold them. */
export interface ViewRows {
  /** Per day, over the previous and the current period. */
  daily: Array<{ day: VnDay; views: number; visitors: number }>;
  /** Over the current period. */
  sources: Array<{ source: string; medium: string; visitors: number }>;
  devices: Array<{ device: LeadDevice; visitors: number }>;
}

/** Leads not suspected of spam: per day over both periods, the rest over the current one. */
export type LeadRows = LeadAnalyticsRows;

export interface ReportInput {
  period: AnalyticsPeriod;
  previousPeriod: AnalyticsPeriod;
  views: ViewRows;
  /** Visitors of each page over the current period; empty for a report about one page. */
  pageVisitors: Array<{ pageId: string; visitors: number }>;
  leads: LeadRows;
  /** Titles of the pages that appear, by id hex. */
  titles: ReadonlyMap<string, string>;
  /** The report is about one page: no breakdown by page. */
  onePage: boolean;
}

function daysOf(period: AnalyticsPeriod): VnDay[] {
  return Array.from({ length: vnDaySpan(period.from, period.to) }, (_, index) =>
    addVnDays(period.from, index),
  );
}

function total(rows: readonly AnalyticsTotals[]): AnalyticsTotals {
  return rows.reduce(
    (sum, row) => ({
      views: sum.views + row.views,
      visitors: sum.visitors + row.visitors,
      leads: sum.leads + row.leads,
    }),
    { views: 0, visitors: 0, leads: 0 },
  );
}

/**
 * Board 11 from the stored totals (ADR-019): every day of the period (zeros included), the totals
 * of both periods, the source pairs and pages with their leads, and visitors by device. Visitors
 * of several days are the sum of each day's.
 */
export function buildAnalyticsReport(input: ReportInput): AnalyticsReport {
  const views = new Map(input.views.daily.map((row) => [row.day, row]));
  const leads = new Map(input.leads.daily.map((row) => [row.day, row.leads]));
  const dayRow = (day: VnDay) => ({
    day,
    views: views.get(day)?.views ?? 0,
    visitors: views.get(day)?.visitors ?? 0,
    leads: leads.get(day) ?? 0,
  });
  const daily = daysOf(input.period).map(dayRow);

  const pairs = new Map<string, AnalyticsReport['sources'][number]>();
  const pairOf = (source: string, medium: string) => {
    const key = `${source}\n${medium}`;
    let row = pairs.get(key);
    if (row === undefined) {
      row = { source, medium, visitors: 0, leads: 0 };
      pairs.set(key, row);
    }
    return row;
  };
  for (const row of input.views.sources) {
    pairOf(row.source, row.medium).visitors += row.visitors;
  }
  for (const row of input.leads.sources) {
    pairOf(row.source, row.medium).leads += row.leads;
  }
  const sources = [...pairs.values()]
    .sort(
      (a, b) =>
        b.visitors - a.visitors ||
        b.leads - a.leads ||
        `${a.source}/${a.medium}`.localeCompare(`${b.source}/${b.medium}`),
    )
    .slice(0, ANALYTICS_SOURCES_SHOWN);

  const pageRows = new Map<string, { visitors: number; leads: number }>();
  if (!input.onePage) {
    for (const row of input.pageVisitors) {
      pageRows.set(row.pageId, { visitors: row.visitors, leads: 0 });
    }
    for (const row of input.leads.pages) {
      const page = pageRows.get(row.pageId) ?? { visitors: 0, leads: 0 };
      pageRows.set(row.pageId, { ...page, leads: page.leads + row.leads });
    }
  }
  const pages = [...pageRows.entries()]
    .flatMap(([id, counts]) => {
      const title = input.titles.get(id);
      // Pages are never deleted; a missing title is data edited by hand, left out.
      return title === undefined ? [] : [{ page: { id, title }, ...counts }];
    })
    .sort(
      (a, b) =>
        b.leads - a.leads || b.visitors - a.visitors || a.page.title.localeCompare(b.page.title),
    );

  const devices = { mobile: 0, desktop: 0 };
  for (const row of input.views.devices) {
    devices[row.device] += row.visitors;
  }

  return {
    period: input.period,
    previousPeriod: input.previousPeriod,
    totals: total(daily),
    previousTotals: total(daysOf(input.previousPeriod).map(dayRow)),
    daily,
    sources,
    pages,
    devices,
  };
}
