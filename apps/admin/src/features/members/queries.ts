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
};
