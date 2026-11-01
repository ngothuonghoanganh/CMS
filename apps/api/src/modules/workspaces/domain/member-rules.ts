import { createHash, randomBytes } from 'node:crypto';
import {
  type Access,
  INVITATION_VALID_DAYS,
  type InvitationState,
  roleSchema,
} from '@plp/contracts';

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

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

/**
 * The mailbox an address reaches, for its daily limit: "an+moi1@x" and "An@x" are one mailbox,
 * and Gmail ignores dots in the local part, so variants of one address share its limit.
 */
export function mailboxOf(email: string): string {
  const lower = email.trim().toLowerCase();
  const at = lower.lastIndexOf('@');
  const domain = lower.slice(at + 1);
  const local = lower.slice(0, at).split('+')[0] ?? '';
  return GMAIL_DOMAINS.has(domain)
    ? `${local.replaceAll('.', '')}@gmail.com`
    : `${local}@${domain}`;
}

/** Rate-limit keys of an invitation email; the mailbox is hashed so no address is stored. */
export function invitationLimitKeys(
  email: string,
  workspaceId: { toHexString(): string },
): { workspace: string; address: string } {
  const address = createHash('sha256').update(mailboxOf(email)).digest('hex');
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

/** Where a role sorts: the system roles most powerful first, custom roles after them. */
function rankOf(access: Access): number {
  return typeof access === 'string'
    ? roleSchema.options.indexOf(access)
    : roleSchema.options.length;
}

/** Members in the order of the list: most powerful role first, then by name. */
export function compareMembers(
  a: { role: Access; name: string },
  b: { role: Access; name: string },
): number {
  const rank = rankOf(a.role) - rankOf(b.role);
  return rank !== 0 ? rank : a.name.localeCompare(b.name, 'vi');
}
