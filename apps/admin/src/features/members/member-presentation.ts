import {
  type AssignableRole,
  assignableRoleSchema,
  can,
  type Invitation,
  permissionGroups,
  type PermissionRow,
  type Role,
  roleDescriptions,
  roleLabels,
  type Site,
} from '@plp/contracts';
import type { BadgeTone } from '@plp/ui';

const DAY_MS = 86_400_000;

/** The roles one can give or ask for, with what they do (board 15). */
export const assignableRoles: { value: AssignableRole; label: string; description: string }[] =
  assignableRoleSchema.options.map((role) => ({
    value: role,
    label: roleLabels[role],
    description: roleDescriptions[role],
  }));

/** "Toàn workspace", or the names of the sites the user can see. */
export function scopeLabel(siteIds: readonly string[] | null, sites: readonly Site[]): string {
  if (siteIds === null) {
    return 'Toàn workspace';
  }
  const names = sites.filter((site) => siteIds.includes(site.id)).map((site) => site.name);
  return names.length === 0 ? `${siteIds.length} site` : names.join(', ');
}

/** Where a pending invitation stands, as the "TRẠNG THÁI" column shows it. */
export function invitationStatus(
  invitation: Pick<Invitation, 'expiresAt' | 'sentAt'>,
  now: number,
): { label: string; tone: BadgeTone } {
  const left = new Date(invitation.expiresAt).getTime() - now;
  if (left <= 0) {
    return { label: 'Đã hết hạn', tone: 'warning' };
  }
  if (invitation.sentAt === null) {
    return { label: 'Chưa gửi được', tone: 'warning' };
  }
  // Rounded: the screen's clock may be a little older than the invitation itself.
  const days = Math.max(1, Math.round(left / DAY_MS));
  return { label: `Hết hạn sau ${days} ngày`, tone: 'primary' };
}

/** What a role may and may not do, from the table the API enforces (ADR-020). */
export function permissionSummary(role: Role): { allowed: string[]; denied: string[] } {
  const rows = permissionGroups.flatMap((group) => group.rows);
  // A role that asks for a row does it once approved (ADR-023).
  const asks = (row: PermissionRow) => row.request !== undefined && can(role, row.request);
  return {
    allowed: rows.flatMap((row) =>
      can(role, row.permission) ? [row.label] : asks(row) ? [`${row.label} (cần được duyệt)`] : [],
    ),
    denied: rows.filter((row) => !can(role, row.permission) && !asks(row)).map((row) => row.label),
  };
}

/** "Sẽ thêm" / "Sẽ gỡ" beside a site of the change dialog; null when it stays as it is. */
export function siteChange(
  siteId: string,
  before: readonly string[] | null,
  after: readonly string[] | null,
): 'add' | 'remove' | null {
  const had = before === null || before.includes(siteId);
  const has = after === null || after.includes(siteId);
  return had === has ? null : has ? 'add' : 'remove';
}

/** Emails typed in one field, split on commas, semicolons, spaces and lines. */
export function parseEmails(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\s,;]+/)
        .map((part) => part.trim().toLowerCase())
        .filter((part) => part !== ''),
    ),
  ];
}
