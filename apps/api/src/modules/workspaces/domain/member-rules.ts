import { createHash, randomBytes } from 'node:crypto';
import { INVITATION_VALID_DAYS, type InvitationState, type Role, roleSchema } from '@plp/contracts';

const DAY_MS = 86_400_000;

/** Closed and expired invitations, and decided access requests, are deleted this much later. */
export const PURGE_AFTER_DAYS = 30;

/** Invitation emails a day: per workspace, and per address from every workspace (ADR-021). */
export const INVITATION_EMAILS_PER_DAY = { workspace: 50, address: 5 } as const;

/** Access requests a member may send a day (ADR-021). */
export const ACCESS_REQUESTS_PER_DAY = 5;

/** An invitation link's secret and what the database keeps of it. */
export function newInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashInvitationToken(token) };
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** When a link sent now stops working. */
export function invitationExpiry(now: Date): Date {
  return new Date(now.getTime() + INVITATION_VALID_DAYS * DAY_MS);
}

/** When MongoDB deletes a record that closed or expired at `at`. */
export function purgeAfter(at: Date): Date {
  return new Date(at.getTime() + PURGE_AFTER_DAYS * DAY_MS);
}

/** Where an invitation stands; a pending one past its expiry is expired. */
export function invitationState(
  invitation: { status: 'pending' | 'accepted' | 'revoked' | 'declined'; expiresAt: Date },
  now: Date,
): InvitationState {
  if (invitation.status === 'pending' && invitation.expiresAt.getTime() <= now.getTime()) {
    return 'expired';
  }
  return invitation.status;
}

/** Rate-limit keys of an invitation email; the address is hashed so none is stored. */
export function invitationLimitKeys(
  email: string,
  workspaceId: { toHexString(): string },
): { workspace: string; address: string } {
  const address = createHash('sha256').update(email.toLowerCase()).digest('hex');
  return {
    workspace: `member-invite:workspace:${workspaceId.toHexString()}`,
    address: `member-invite:address:${address}`,
  };
}

/** Sites that are not the workspace's: a grant may only name the workspace's own sites. */
export function foreignSites(
  siteIds: readonly string[] | null,
  workspaceSiteIds: readonly string[],
): string[] {
  if (siteIds === null) {
    return [];
  }
  const own = new Set(workspaceSiteIds);
  return siteIds.filter((id) => !own.has(id));
}

/** Members in the order of the list: most powerful role first, then by name. */
export function compareMembers(
  a: { role: Role; name: string },
  b: { role: Role; name: string },
): number {
  const rank = roleSchema.options.indexOf(a.role) - roleSchema.options.indexOf(b.role);
  return rank !== 0 ? rank : a.name.localeCompare(b.name, 'vi');
}
