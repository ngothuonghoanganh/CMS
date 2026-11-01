import {
  type AssignableRole,
  type CustomizablePermission,
  customizablePermissionsOf,
  type CustomRole,
  customRoleGroups,
} from '@plp/contracts';

/** What the editor of board 16 holds before "Lưu vai trò" (ADR-024). */
export interface CustomRoleDraft {
  name: string;
  basedOn: AssignableRole;
  permissions: CustomizablePermission[];
  wholeWorkspace: boolean;
}

/** "Vai trò tùy chỉnh": a copy of a system role, Biên tập unless another is chosen. */
export function newDraft(basedOn: AssignableRole = 'editor'): CustomRoleDraft {
  return {
    name: '',
    basedOn,
    permissions: customizablePermissionsOf(basedOn),
    wholeWorkspace: false,
  };
}

export function draftOf(role: CustomRole): CustomRoleDraft {
  return {
    name: role.name,
    basedOn: role.basedOn,
    permissions: [...role.permissions],
    wholeWorkspace: role.wholeWorkspace,
  };
}

/** Starting again from another system role keeps the name and the scope. */
export function rebased(draft: CustomRoleDraft, basedOn: AssignableRole): CustomRoleDraft {
  return { ...draft, basedOn, permissions: customizablePermissionsOf(basedOn) };
}

/** The row "Xuất bản, cập nhật trang live" has three levels: no, ask ("Yêu cầu"), yes. */
export type PublishLevel = 'off' | 'request' | 'on';

export function publishLevelOf(permissions: readonly CustomizablePermission[]): PublishLevel {
  if (permissions.includes('pages.publish')) {
    return 'on';
  }
  return permissions.includes('pages.requestPublish') ? 'request' : 'off';
}

/** What switching one on also needs, and what switching one off also takes away. */
const NEEDS: Partial<Record<CustomizablePermission, CustomizablePermission[]>> = {
  'pages.publish': ['pages.edit'],
  'pages.requestPublish': ['pages.edit'],
  'pages.manageLive': ['pages.edit'],
  'publishApprovals.decide': ['pages.publish', 'pages.edit'],
  'leads.handle': ['leads.view'],
  'leads.export': ['leads.view'],
  'personalData.manage': ['leads.view'],
};

function without(
  permissions: readonly CustomizablePermission[],
  removed: CustomizablePermission,
): CustomizablePermission[] {
  // Everything that needs the permission goes with it.
  const dependents = Object.entries(NEEDS).flatMap(([permission, needs]) =>
    needs.includes(removed) ? [permission] : [],
  );
  return permissions.filter((item) => item !== removed && !dependents.includes(item));
}

function withAll(
  permissions: readonly CustomizablePermission[],
  added: readonly CustomizablePermission[],
): CustomizablePermission[] {
  const next = [...permissions];
  for (const permission of added) {
    if (!next.includes(permission)) {
      next.push(permission);
    }
  }
  return next;
}

/**
 * Switches one row on or off, keeping the draft valid: what it needs comes along, what needs it
 * goes. Publishing directly and asking to publish never stand together.
 */
export function toggled(
  permissions: readonly CustomizablePermission[],
  permission: CustomizablePermission,
  on: boolean,
): CustomizablePermission[] {
  if (!on) {
    return without(permissions, permission);
  }
  const next = withAll(permissions, [...(NEEDS[permission] ?? []), permission]);
  return permission === 'pages.publish' || permission === 'publishApprovals.decide'
    ? next.filter((item) => item !== 'pages.requestPublish')
    : next;
}

export function withPublishLevel(
  permissions: readonly CustomizablePermission[],
  level: PublishLevel,
): CustomizablePermission[] {
  const off = without(without(permissions, 'pages.publish'), 'pages.requestPublish');
  if (level === 'off') {
    return off;
  }
  return toggled(off, level === 'on' ? 'pages.publish' : 'pages.requestPublish', true);
}

const LABELS = new Map<CustomizablePermission, string>([
  ...customRoleGroups.flatMap((group) =>
    group.rows.map((row) => [row.permission, row.label] as const),
  ),
  ['pages.requestPublish', 'Gửi yêu cầu xuất bản (phải được duyệt)'],
]);

function permissionLabel(permission: CustomizablePermission): string {
  return LABELS.get(permission) ?? permission;
}

/** "Thêm" or "Bỏ" beside a row that differs from the role it started from. */
export function changeOf(
  draft: CustomRoleDraft,
  permission: CustomizablePermission,
): 'added' | 'removed' | null {
  const base = customizablePermissionsOf(draft.basedOn).includes(permission);
  const now = draft.permissions.includes(permission);
  return base === now ? null : now ? 'added' : 'removed';
}

/** "Tóm tắt trước khi lưu": every difference from the role it started from, in board order. */
export function summaryLines(
  draft: CustomRoleDraft,
): { change: 'added' | 'removed'; label: string }[] {
  const order: CustomizablePermission[] = customRoleGroups.flatMap((group) =>
    group.rows.flatMap((row) =>
      row.request === undefined ? [row.permission] : [row.permission, row.request],
    ),
  );
  return order.flatMap((permission) => {
    const change = changeOf(draft, permission);
    return change === null ? [] : [{ change, label: permissionLabel(permission) }];
  });
}

/**
 * What switching one row also changed, for the screen reader: "Cũng tắt: …" and "Cũng bật: …".
 * Empty when only that row changed.
 */
export function alsoChanged(
  before: readonly CustomizablePermission[],
  after: readonly CustomizablePermission[],
  switched: readonly CustomizablePermission[],
): string {
  const others = (
    list: readonly CustomizablePermission[],
    other: readonly CustomizablePermission[],
  ) => list.filter((permission) => !other.includes(permission) && !switched.includes(permission));
  const on = others(after, before).map(permissionLabel);
  const off = others(before, after).map(permissionLabel);
  return [
    ...(on.length === 0 ? [] : [`Cũng bật: ${on.join(', ')}.`]),
    ...(off.length === 0 ? [] : [`Cũng tắt: ${off.join(', ')}.`]),
  ].join(' ');
}
