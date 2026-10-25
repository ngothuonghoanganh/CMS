import { siteQueryKeys } from '../dashboard/queries';

function pageKey(siteId: string, pageId: string) {
  return [...siteQueryKeys.pages(siteId), 'page', pageId] as const;
}

/**
 * TanStack Query keys of one page's workspace screens. They sit under the site's key, so
 * invalidating `siteQueryKeys.site(siteId)` after a pointer move refreshes them with the dashboard.
 */
export const pageQueryKeys = {
  page: pageKey,
  summary: (siteId: string, pageId: string) => [...pageKey(siteId, pageId), 'summary'] as const,
  history: (siteId: string, pageId: string) => [...pageKey(siteId, pageId), 'history'] as const,
  /** The draft "Sao chép vào bản nháp" replaces, read again each time its dialog opens. */
  draftBase: (siteId: string, pageId: string) =>
    [...pageKey(siteId, pageId), 'draft-base'] as const,
};

/** History entries per request; older ones load with "Xem thêm … phiên bản cũ hơn". */
export const HISTORY_PAGE_SIZE = 20;
