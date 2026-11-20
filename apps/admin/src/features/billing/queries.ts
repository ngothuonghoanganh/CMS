'use client';

import { type BillingSummary, endpoints, type WorkspacePlan } from '@plp/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { api } from '../../lib/api';

/** Query keys of a workspace's plan (ADR-035). */
export const billingQueryKeys = {
  all: (workspaceId: string) => ['workspaces', workspaceId, 'billing'] as const,
  /** The member-level plan of the sidebar, the banner and the "Nâng cấp" chips. */
  plan: (workspaceId: string) => ['workspaces', workspaceId, 'billing', 'plan'] as const,
  summary: (workspaceId: string) => ['workspaces', workspaceId, 'billing', 'summary'] as const,
};

/**
 * The workspace's plan, starting from what the server loaded with the frame. Changing the plan on
 * board 28 updates it, so the sidebar and the banner follow without a page load. The state also
 * moves with time (a trial ends) and with changes made elsewhere (the Owner upgrades in another
 * tab), so it is read again when the user comes back to the tab.
 */
export function useLivePlan(workspaceId: string, initial: WorkspacePlan): WorkspacePlan {
  const queryClient = useQueryClient();
  // A frame rendered again by the server (a load, another layout, a refresh) is the newest plan:
  // `initialData` alone would be ignored once an earlier screen cached the key.
  useEffect(() => {
    queryClient.setQueryData(billingQueryKeys.plan(workspaceId), initial);
  }, [queryClient, workspaceId, initial]);
  return useQuery({
    queryKey: billingQueryKeys.plan(workspaceId),
    queryFn: ({ signal }) => api(endpoints.getWorkspacePlan, [workspaceId], { signal }),
    initialData: initial,
    refetchOnWindowFocus: true,
  }).data;
}

/**
 * Reads the plan again when the user opens another screen of a frame that stays mounted (the
 * shell's layout): a change made elsewhere, or a trial that ended meanwhile, shows on that screen.
 */
export function usePlanOnEveryScreen(workspaceId: string): void {
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const shownAt = useRef(pathname);
  useEffect(() => {
    if (shownAt.current !== pathname) {
      shownAt.current = pathname;
      void queryClient.invalidateQueries({
        queryKey: billingQueryKeys.plan(workspaceId),
        exact: true,
      });
    }
  }, [pathname, queryClient, workspaceId]);
}

/**
 * Board 28's summary from what the server loaded at `loadedAt`, which replaces an older visit's
 * cache (a site created meanwhile counts at once); read again when the user comes back to the tab.
 */
export function useBillingSummary(
  workspaceId: string,
  initial: BillingSummary,
  loadedAt: number,
): BillingSummary {
  const queryClient = useQueryClient();
  useEffect(() => {
    const key = billingQueryKeys.summary(workspaceId);
    const cached = queryClient.getQueryState(key);
    if (cached === undefined || cached.dataUpdatedAt < loadedAt) {
      queryClient.setQueryData(key, initial, { updatedAt: loadedAt });
    }
  }, [queryClient, workspaceId, initial, loadedAt]);
  return useQuery({
    queryKey: billingQueryKeys.summary(workspaceId),
    queryFn: ({ signal }) => api(endpoints.getBillingSummary, [workspaceId], { signal }),
    initialData: initial,
    initialDataUpdatedAt: loadedAt,
    refetchOnWindowFocus: true,
  }).data;
}
