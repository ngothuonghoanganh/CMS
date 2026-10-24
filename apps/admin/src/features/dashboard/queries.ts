import type { DashboardFilters } from './filters';

/**
 * TanStack Query keys for site data shown in the workspace. Invalidate `siteQueryKeys.site(id)`
 * after anything that changes pages or activity of a site (publish, rollback, unpublish, …).
 */
export const siteQueryKeys = {
  site: (siteId: string) => ['sites', siteId] as const,
  pages: (siteId: string) => ['sites', siteId, 'pages'] as const,
  pageList: (siteId: string, filters: DashboardFilters) =>
    ['sites', siteId, 'pages', 'list', filters.status ?? 'all', filters.q] as const,
  recentActivity: (siteId: string) => ['sites', siteId, 'activity', 'recent'] as const,
};

/** Pages per request (the API maximum); further pages load with "Xem thêm trang". */
export const PAGE_LIST_LIMIT = 50;

/** Items in "Hoạt động xuất bản gần đây". */
export const RECENT_ACTIVITY_LIMIT = 5;
