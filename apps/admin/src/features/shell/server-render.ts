import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * Puts the data a server render loaded into the cache, unless the cache holds newer data.
 *
 * TanStack Query uses `initialData` only for a key that has no data yet. A screen the server
 * renders again (a sidebar link, the editor's back arrow) would otherwise show what the browser
 * cached on an earlier visit for as long as that counts as fresh, although autosave, a new lead or
 * another member changed it since. An older render, such as one the browser's back button
 * restores, never replaces newer data. Call it from an effect (ADR-018, ADR-019).
 */
export function adoptServerRender(
  queryClient: QueryClient,
  queryKey: QueryKey,
  data: unknown,
  loadedAt: number,
): void {
  if ((queryClient.getQueryState(queryKey)?.dataUpdatedAt ?? 0) < loadedAt) {
    queryClient.setQueryData(queryKey, data, { updatedAt: loadedAt });
  }
}

/**
 * An infinite list as a server render loads it: its first page only. Screens build it here for
 * both `initialData` and `adoptServerRender`, so the cached shape is the one the query reads.
 */
export function serverFirstPage<TPage>(page: TPage): InfiniteData<TPage, string | null> {
  return { pages: [page], pageParams: [null] };
}
