/**
 * TanStack Query keys of the data requests, under the site's keys. A completed request also
 * changes leads: invalidate `leadQueryKeys.all(siteId)` with it.
 */
export const dataRequestQueryKeys = {
  all: (siteId: string) => ['sites', siteId, 'data-requests'] as const,
  list: (siteId: string) => ['sites', siteId, 'data-requests', 'list'] as const,
  detail: (siteId: string, requestId: string) =>
    ['sites', siteId, 'data-requests', 'detail', requestId] as const,
};

/** Requests per page of the list ("Tải thêm" loads the next). */
export const DATA_REQUEST_PAGE_SIZE = 20;
