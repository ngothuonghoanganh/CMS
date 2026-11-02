import {
  accessLabel,
  type AssignableRole,
  assignableRoleSchema,
  can,
  type CustomRole,
  customRolePermissions,
  customRoleRef,
  emailSchema,
  foldVietnamese,
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

/**
 * "Toàn workspace", or the names of the workspace's sites among `siteIds`. An id of no site of the
 * workspace is a site deleted since (ADR-027): it gives nothing, so it is not counted.
 */
export function scopeLabel(siteIds: readonly string[] | null, sites: readonly Site[]): string {
  if (siteIds === null) {
    return 'Toàn workspace';
  }
  const names = sites.filter((site) => siteIds.includes(site.id)).map((site) => site.name);
  return names.length === 0 ? '0 site' : names.join(', ');
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

/** The filter value of a role: the system role, or `custom:{id}` (ADR-024). */
export function roleKey(access: Access): string {
  return typeof access === 'string' ? access : customRoleRef(access.customRoleId);
}

/** The filters of screen 15, shared by its members and its pending invitations (ADR-021). */
export interface PeopleFilters {
  /** `all`, a system role or `custom:{id}`. */
  role: string;
  /** `all` or a site id. */
  siteId: string;
  search: string;
}

/**
 * Whether a member or an invitation shows under the filters. Someone given the whole workspace
 * works on every site; an invitation has no name, only its email. The search ignores case and
 * accents, as the lead inbox does (ADR-018): "ngoc" finds "Ngọc".
 */
export function matchesFilters(
  person: { role: Access; siteIds: readonly string[] | null; name?: string; email: string },
  filters: PeopleFilters,
): boolean {
  const query = foldVietnamese(filters.search);
  return (
    (filters.role === 'all' || roleKey(person.role) === filters.role) &&
    (filters.siteId === 'all' ||
      person.siteIds === null ||
      person.siteIds.includes(filters.siteId)) &&
    (query === '' ||
      [person.name ?? '', person.email].some((text) => foldVietnamese(text).includes(query)))
  );
}

/** Spaces, commas and semicolons end an email; a pasted list may use any of them. */
const EMAIL_SEPARATORS = /[\s,;]+/;

/** The address as the API keeps it (`emailSchema`): trimmed, in lower case. */
export function normalizeEmail(text: string): string {
  return text.trim().toLowerCase();
}

/**
 * What was typed into "Mời thành viên": the emails a separator ended, and the text after the last
 * one, still being typed ("An@bep.vn, thuy@" gives `an@bep.vn` and "thuy@").
 */
export function splitEmailInput(text: string): { complete: string[]; rest: string } {
  const parts = text.split(EMAIL_SEPARATORS);
  const rest = parts.pop() ?? '';
  return { complete: parts.map(normalizeEmail).filter((part) => part !== ''), rest };
}

/** Why an email of "Mời thành viên" will not be invited. */
export type InviteEmailProblem = 'invalid' | 'member' | 'invited';

export const inviteEmailProblemLabels: Record<InviteEmailProblem, string> = {
  invalid: 'Email không hợp lệ',
  member: 'Đã là thành viên',
  invited: 'Đang có lời mời',
};

/** The emails of the workspace's members and pending invitations, as screen 15 loaded them. */
export interface KnownEmails {
  members: ReadonlySet<string>;
  invited: ReadonlySet<string>;
}

export function knownEmails(
  members: readonly { email: string }[],
  invitations: readonly { email: string }[],
): KnownEmails {
  return {
    members: new Set(members.map((member) => normalizeEmail(member.email))),
    invited: new Set(invitations.map((invitation) => normalizeEmail(invitation.email))),
  };
}

/**
 * What screen 15 can tell at once about an email, before anything is sent. The API still decides
 * (ADR-021): someone may join or be invited meanwhile.
 */
export function inviteEmailProblem(email: string, known: KnownEmails): InviteEmailProblem | null {
  if (!emailSchema.safeParse(email).success) {
    return 'invalid';
  }
  const address = normalizeEmail(email);
  if (known.members.has(address)) {
    return 'member';
  }
  return known.invited.has(address) ? 'invited' : null;
}

/** A piece of "Tóm tắt thay đổi"; roles and sites stand out. */
export interface SummaryPart {
  text: string;
  strong: boolean;
}

function plain(text: string): SummaryPart {
  return { text, strong: false };
}

function strong(text: string): SummaryPart {
  return { text, strong: true };
}

/** "A, B", the sites by name; sites this screen does not know are counted. */
function siteNameParts(ids: readonly string[], sites: readonly Site[]): SummaryPart[] {
  const names = sites.filter((site) => ids.includes(site.id)).map((site) => strong(site.name));
  const unknown = ids.length - names.length;
  const parts =
    unknown > 0
      ? [...names, plain(names.length > 0 ? `${unknown} site khác` : `${unknown} site`)]
      : names;
  return parts.flatMap((part, index) => (index === 0 ? [part] : [plain(', '), part]));
}

/**
 * "Tóm tắt thay đổi" of "Đổi quyền" (board 15, ADR-021): the old role → the new one, then the
 * sites added and removed, in the board's words. `siteIds` null is the whole workspace.
 */
export function accessChangeSummary(
  before: { role: Access; siteIds: readonly string[] | null },
  after: { role: Access; siteIds: readonly string[] | null },
  sites: readonly Site[],
): SummaryPart[] {
  const role = accessLabel(after.role);
  const sentences: SummaryPart[][] = [];
  if (roleKey(before.role) !== roleKey(after.role)) {
    sentences.push([
      plain('Đổi vai trò '),
      strong(accessLabel(before.role)),
      plain(' → '),
      strong(role),
      plain('.'),
    ]);
  }
  if (before.siteIds !== null && after.siteIds === null) {
    sentences.push([
      plain(`Thêm quyền ${role} trên `),
      strong('toàn workspace'),
      plain(', gồm site tạo sau này.'),
    ]);
  } else if (before.siteIds === null && after.siteIds !== null) {
    sentences.push([
      plain('Gỡ quyền trên '),
      strong('toàn workspace'),
      ...(after.siteIds.length === 0
        ? []
        : [plain(', chỉ giữ '), ...siteNameParts(after.siteIds, sites)]),
      plain('.'),
    ]);
  } else if (before.siteIds !== null && after.siteIds !== null) {
    const had = before.siteIds;
    const has = after.siteIds;
    const added = has.filter((id) => !had.includes(id));
    const removed = had.filter((id) => !has.includes(id));
    if (added.length > 0) {
      sentences.push([
        plain(`Thêm quyền ${role} trên `),
        ...siteNameParts(added, sites),
        plain('.'),
      ]);
    }
    if (removed.length > 0) {
      sentences.push([plain('Gỡ quyền trên '), ...siteNameParts(removed, sites), plain('.')]);
    }
  }
  if (sentences.length === 0) {
    return [plain('Chưa có thay đổi.')];
  }
  return sentences.flatMap((sentence, index) =>
    index === 0 ? sentence : [plain(' '), ...sentence],
  );
}
