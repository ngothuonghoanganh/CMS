import type { QueryClient } from '@tanstack/react-query';
import { siteQueryKeys } from '../dashboard/queries';
import { pageQueryKeys } from '../history/queries';

/*
 * The page lists and a page's own screens (history, its header) show the status the server
 * derives from the draft. After the editor changes it, they are marked stale: one on screen now is
 * read again at once, the others when shown, even when the browser's Back button restores a render
 * older than the cache. The editor and the SEO screen show none of them, so this reads nothing
 * while they are open.
 */

/** After the draft of one page changed on the server (a save, "Quay về bản live"). */
export function markPageScreensStale(queryClient: QueryClient, siteId: string, pageId: string) {
  for (const queryKey of [siteQueryKeys.pageLists(siteId), pageQueryKeys.page(siteId, pageId)]) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

/** After a site setting every page reminds of changed (the theme): every page's status line. */
export function markSiteScreensStale(queryClient: QueryClient, siteId: string) {
  for (const queryKey of [siteQueryKeys.pageLists(siteId), pageQueryKeys.pages(siteId)]) {
    void queryClient.invalidateQueries({ queryKey });
  }
}
