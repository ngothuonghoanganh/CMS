import type { AnalyticsFilters } from './filters';

/** TanStack Query keys of "Hiệu quả", under the site's keys. */
export const analyticsQueryKeys = {
  all: (siteId: string) => ['sites', siteId, 'analytics'] as const,
  report: (siteId: string, filters: AnalyticsFilters) =>
    ['sites', siteId, 'analytics', filters.range, filters.pageId] as const,
};
