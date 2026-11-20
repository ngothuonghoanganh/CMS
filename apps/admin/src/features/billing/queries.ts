'use client';

import { endpoints, type WorkspacePlan } from '@plp/contracts';
import { useQuery } from '@tanstack/react-query';
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
 * board 28 updates it, so the sidebar and the banner follow without a page load.
 */
export function useLivePlan(workspaceId: string, initial: WorkspacePlan): WorkspacePlan {
  return useQuery({
    queryKey: billingQueryKeys.plan(workspaceId),
    queryFn: ({ signal }) => api(endpoints.getWorkspacePlan, [workspaceId], { signal }),
    initialData: initial,
  }).data;
}
