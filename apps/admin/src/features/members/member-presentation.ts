import {
  type AssignableRole,
  assignableRoleSchema,
  can,
  type CustomRole,
  customRolePermissions,
  customRoleRef,
  type RoleChoice,
  type Invitation,
  permissionGroups,
  type PermissionRow,
  roleDescriptions,
  roleLabels,
  type Site,
  type Access,
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

/** A role "Mời thành viên" and "Đổi quyền" can give: a system role or a custom one (ADR-024). */
export interface RoleOption {
  value: RoleChoice;
  label: string;
  description: string;
  /** Given on every site of the workspace: Quản trị, or a custom role set to it. */
  wholeWorkspace: boolean;
  access: Access;
}

/** The access a custom role gives its holders. */
function customRoleAccess(role: Pick<CustomRole, 'id' | 'name' | 'permissions'>): Access {
  return {
    customRoleId: role.id,
    name: role.name,
    permissions: customRolePermissions(role.permissions),
  };
}

/** The system roles one can give, then the workspace's custom roles. */
export function roleOptions(customRoles: readonly CustomRole[]): RoleOption[] {
  return [
    ...assignableRoles.map((role) => ({
      ...role,
      wholeWorkspace: role.value === 'admin',
      access: role.value,
    })),
    ...customRoles.map((role) => {
      const access = customRoleAccess(role);
      return {
        value: customRoleRef(role.id),
        label: role.name,
        description: accessDescription(access),
        wholeWorkspace: role.wholeWorkspace,
        access,
      };
    }),
  ];
}

/** The choice that gives a member the role they have; Chủ sở hữu is never given. */
export function roleChoiceOf(access: Access): RoleChoice {
  if (typeof access !== 'string') {
    return customRoleRef(access.customRoleId);
  }
  return access === 'owner' ? 'admin' : access;
}

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
export function permissionSummary(role: Access): { allowed: string[]; denied: string[] } {
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

/** What a role does in a sentence; a custom role lists what it may do (ADR-024). */
export function accessDescription(access: Access): string {
  return typeof access === 'string'
    ? roleDescriptions[access]
    : `Vai trò riêng của workspace: ${permissionSummary(access).allowed.join('; ')}.`;
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
