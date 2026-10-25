'use client';

import { endpoints, type LeadCounts } from '@plp/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '../../lib/api';
import type { LeadInboxFilters } from './filters';

/**
 * TanStack Query keys of the lead inbox, under the site's keys. Invalidate `leadQueryKeys.all(id)`
 * after anything that changes leads: the list, the counts and the open lead refresh together.
 */
export const leadQueryKeys = {
  all: (siteId: string) => ['sites', siteId, 'leads'] as const,
  counts: (siteId: string) => ['sites', siteId, 'leads', 'counts'] as const,
  /** Every filtered list of the inbox. */
  lists: (siteId: string) => ['sites', siteId, 'leads', 'list'] as const,
  list: (siteId: string, filters: LeadInboxFilters) =>
    [
      'sites',
      siteId,
      'leads',
      'list',
      filters.folder,
      filters.pageId,
      filters.status,
      filters.range,
      filters.from,
      filters.to,
      filters.q,
    ] as const,
  detail: (siteId: string, leadId: string) => ['sites', siteId, 'leads', 'detail', leadId] as const,
  pageRefs: (siteId: string) => ['sites', siteId, 'page-refs'] as const,
  recipients: (siteId: string) => ['sites', siteId, 'lead-recipients'] as const,
};

/**
 * "N mới" in the sidebar and the lead card of the dashboard. They share one cache entry, so a
 * change in the inbox updates both.
 *
 * A page the server just rendered passes `loadedAt` with the counts it loaded: they replace older
 * cached counts, so the sidebar (whose layout keeps its first data) shows the same number as the
 * page it opened (ADR-018).
 */
export function useLeadCounts(siteId: string, serverCounts: LeadCounts, loadedAt?: number) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (loadedAt === undefined) {
      return;
    }
    const key = leadQueryKeys.counts(siteId);
    if ((queryClient.getQueryState(key)?.dataUpdatedAt ?? 0) < loadedAt) {
      queryClient.setQueryData(key, serverCounts, { updatedAt: loadedAt });
    }
  }, [queryClient, siteId, serverCounts, loadedAt]);
  return useQuery({
    queryKey: leadQueryKeys.counts(siteId),
    queryFn: ({ signal }) => api(endpoints.leadCounts, [siteId], { signal }),
    initialData: serverCounts,
    ...(loadedAt === undefined ? {} : { initialDataUpdatedAt: loadedAt }),
  });
}
