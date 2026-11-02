'use client';

import { endpoints } from '@plp/contracts';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

/** Query keys of a workspace's people (ADR-021). */
export const memberQueryKeys = {
  all: (workspaceId: string) => ['workspaces', workspaceId, 'members'] as const,
  members: (workspaceId: string) => ['workspaces', workspaceId, 'members', 'list'] as const,
  invitations: (workspaceId: string) =>
    ['workspaces', workspaceId, 'members', 'invitations'] as const,
  requests: (workspaceId: string) => ['workspaces', workspaceId, 'members', 'requests'] as const,
  myRequest: (workspaceId: string) => ['workspaces', workspaceId, 'members', 'my-request'] as const,
  /** Custom roles (ADR-024): read again with the members, since grants and roles go together. */
  customRoles: (workspaceId: string) =>
    ['workspaces', workspaceId, 'members', 'custom-roles'] as const,
  /** The count of "Thành viên" in the sidebar (ADR-028). */
  count: (workspaceId: string) => ['workspaces', workspaceId, 'members', 'count'] as const,
};

/**
 * The members of the workspace, counted for "Thành viên" in the sidebar. It starts from what the
 * server loaded with the frame, and is under `memberQueryKeys.all`, so whatever "Thành viên"
 * changes (a member removed, an invitation accepted meanwhile) counts again (ADR-028).
 */
export function useMemberCount(workspaceId: string, serverCount: number): number {
  return useQuery({
    queryKey: memberQueryKeys.count(workspaceId),
    queryFn: async ({ signal }) =>
      (await api(endpoints.roleCounts, [workspaceId], { signal })).members,
    initialData: serverCount,
  }).data;
}
