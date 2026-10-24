import { idSchema, type Membership } from '@plp/contracts';

/**
 * Cookie remembering the workspace the user last chose. It is a UI preference only: access is
 * always checked by the API against the user's memberships.
 */
export const WORKSPACE_PREFERENCE_COOKIE = 'plp_ws';

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/** The preferred workspace when the user is still a member of it, otherwise the first one. */
export function pickMembership(
  memberships: readonly Membership[],
  preferredWorkspaceId: string | null | undefined,
): Membership | null {
  const preferred = memberships.find(
    (membership) => membership.workspace.id === preferredWorkspaceId,
  );
  return preferred ?? memberships[0] ?? null;
}

/** `document.cookie` value that stores the preference for a year on the whole admin. */
export function workspacePreferenceCookie(workspaceId: string): string {
  const id = idSchema.parse(workspaceId);
  return `${WORKSPACE_PREFERENCE_COOKIE}=${id}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
}
