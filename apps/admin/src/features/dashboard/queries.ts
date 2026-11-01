import { type ActivityListQuery, publishingActivityTypes } from '@plp/contracts';
import type { DashboardFilters } from './filters';

/**
 * TanStack Query keys for site data shown in the workspace. Invalidate `siteQueryKeys.site(id)`
 * after anything that changes pages or activity of a site (publish, rollback, unpublish, …).
 */
export const siteQueryKeys = {
  site: (siteId: string) => ['sites', siteId] as const,
  pages: (siteId: string) => ['sites', siteId, 'pages'] as const,
  pageLists: (siteId: string) => ['sites', siteId, 'pages', 'list'] as const,
  pageList: (siteId: string, filters: DashboardFilters) =>
    ['sites', siteId, 'pages', 'list', filters.status ?? 'all', filters.q] as const,
  recentActivity: (siteId: string) => ['sites', siteId, 'activity', 'recent'] as const,
};

/** Pages per request (the API maximum); further pages load with "Xem thêm trang". */
export const PAGE_LIST_LIMIT = 50;

/**
 * "Hoạt động xuất bản gần đây": the 5 newest publishing events only, so uploads and page
 * creations never push them out, and a site that never published shows the empty state.
 */
export const RECENT_ACTIVITY_QUERY = {
  limit: 5,
  types: publishingActivityTypes.join(','),
} as const satisfies ActivityListQuery;
