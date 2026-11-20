import { z } from 'zod';
import { type Role, roleLabels, roleSchema } from './auth.js';
import { idSchema } from './common.js';

/**
 * What a member may do, one value per row of board 16 (ADR-020). Every site-scoped endpoint names
 * the permission it needs, and the admin hides what a role cannot do with the same table.
 */
export const permissionSchema = z.enum([
  'pages.view',
  'pages.edit',
  'templates.manage',
  'pages.publish',
  'pages.requestPublish',
  'publishApprovals.decide',
  'pages.manageLive',
  'leads.view',
  'leads.handle',
  'leads.export',
  'personalData.manage',
  'privacy.manage',
  'sites.manage',
  'domains.manage',
  'automations.view',
  'automations.manage',
  'members.manage',
  'accessRequests.decide',
  'workspace.transferOwnership',
  'billing.view',
  'billing.manage',
]);
export type Permission = z.infer<typeof permissionSchema>;

/**
 * Duyệt yêu cầu đổi quyền and the ownership stay with Chủ sở hữu (ADR-021), and so do changing
 * the plan and paying (ADR-035).
 */
const ownerOnly: readonly Permission[] = [
  'accessRequests.decide',
  'workspace.transferOwnership',
  'billing.manage',
];

/** Asking to publish is for roles that cannot publish themselves (ADR-023). */
const askOnly: readonly Permission[] = ['pages.requestPublish'];

/**
 * The permissions of each role. "Xem lead" and "Xuất / xóa dữ liệu cá nhân" are separate rows:
 * Chăm sóc khách hàng handles leads but never exports or deletes a person's data.
 */
const grants: Record<Role, readonly Permission[]> = {
  owner: permissionSchema.options.filter((permission) => !askOnly.includes(permission)),
  admin: permissionSchema.options.filter(
    (permission) => !ownerOnly.includes(permission) && !askOnly.includes(permission),
  ),
  editor: ['pages.view', 'pages.edit', 'templates.manage', 'pages.publish', 'pages.manageLive'],
  contributor: ['pages.view', 'pages.edit', 'pages.requestPublish'],
  support: ['pages.view', 'leads.view', 'leads.handle', 'automations.view'],
  viewer: ['pages.view'],
};

/**
 * A custom role as its holder has it (ADR-024): its name and permissions, read again on every
 * request, so a change to the role applies at once.
 */
export const customAccessSchema = z.object({
  customRoleId: idSchema,
  name: z.string(),
  permissions: z.array(permissionSchema),
});
export type CustomAccess = z.infer<typeof customAccessSchema>;

/** What a member may do: one of the six roles of board 16, or a custom role (ADR-024). */
export const accessSchema = z.union([roleSchema, customAccessSchema]);
export type Access = z.infer<typeof accessSchema>;

/**
 * Whether a permission only reads or also changes data (ADR-035). A read-only workspace refuses
 * the write permissions to requests that change data, except those it keeps.
 */
export type PermissionKind = 'read' | 'write';

export const permissionKinds: Record<Permission, PermissionKind> = {
  'pages.view': 'read',
  'pages.edit': 'write',
  'templates.manage': 'write',
  'pages.publish': 'write',
  'pages.requestPublish': 'write',
  'publishApprovals.decide': 'write',
  'pages.manageLive': 'write',
  'leads.view': 'read',
  'leads.handle': 'write',
  // A copy of the leads; nothing in the workspace changes.
  'leads.export': 'read',
  'personalData.manage': 'write',
  'privacy.manage': 'write',
  'sites.manage': 'write',
  'domains.manage': 'write',
  'automations.view': 'read',
  'automations.manage': 'write',
  'members.manage': 'write',
  'accessRequests.decide': 'write',
  'workspace.transferOwnership': 'write',
  'billing.view': 'read',
  'billing.manage': 'write',
};

/**
 * Writes a read-only workspace still allows (ADR-035): rollback, undo and unpublishing only move
 * the pointer; personal data requests are a legal duty (ADR-017); handing over the workspace and
 * paying are how it gets out of read-only.
 */
const keptWhileReadOnly: readonly Permission[] = [
  'pages.manageLive',
  'personalData.manage',
  'workspace.transferOwnership',
  'billing.manage',
];

/** Whether a read-only workspace refuses the permission to a request that changes data. */
export function refusedWhileReadOnly(permission: Permission): boolean {
  return permissionKinds[permission] === 'write' && !keptWhileReadOnly.includes(permission);
}

/**
 * Actions a read-only workspace keeps although their permission is refused (ADR-035): removing a
 * member, and taking back a pending invitation, which counts as a member.
 */
export const readOnlyKeptActions = ['members.remove', 'invitations.revoke'] as const;
export type ReadOnlyKeptAction = (typeof readOnlyKeptActions)[number];

export function can(access: Access, permission: Permission): boolean {
  return typeof access === 'string'
    ? grants[access].includes(permission)
    : access.permissions.includes(permission);
}

/** "Biên tập", or the name of the custom role. */
export function accessLabel(access: Access): string {
  return typeof access === 'string' ? roleLabels[access] : access.name;
}

/** Roles that hold the permission, most powerful first. */
export function rolesWith(permission: Permission): Role[] {
  return roleSchema.options.filter((role) => can(role, permission));
}

/** "Chủ sở hữu và Quản trị": who may do it, for the message of a refused action. */
export function holdersOf(permission: Permission): string {
  const labels = rolesWith(permission).map((role) => roleLabels[role]);
  const last = labels.pop();
  return labels.length === 0 ? (last ?? '') : `${labels.join(', ')} và ${last ?? ''}`;
}

/** Problem title of a refused action, shared by the API and the admin's notes. */
export function onlyHoldersMessage(permission: Permission): string {
  return `Chỉ ${holdersOf(permission)} được thực hiện thao tác này`;
}

export interface PermissionRow {
  permission: Permission;
  label: string;
  /** Roles holding this one ask instead: the "Yêu cầu" cell of board 16 (ADR-023). */
  request?: Permission;
}

export interface PermissionGroup {
  title: string;
  rows: readonly PermissionRow[];
}

/** Rows of board 16 in its order, only for what the product does today. */
export const permissionGroups: readonly PermissionGroup[] = [
  {
    title: 'Nội dung',
    rows: [
      { permission: 'pages.view', label: 'Xem trang, bản nháp và hiệu quả' },
      { permission: 'pages.edit', label: 'Sửa bản nháp, section, SEO, tải ảnh lên' },
      // With `pages.view` on the page it is saved from (ADR-030).
      { permission: 'templates.manage', label: 'Lưu và quản lý template của workspace' },
    ],
  },
  {
    title: 'Xuất bản',
    rows: [
      {
        permission: 'pages.publish',
        label: 'Xuất bản, cập nhật trang live',
        request: 'pages.requestPublish',
      },
      { permission: 'publishApprovals.decide', label: 'Duyệt hoặc từ chối yêu cầu xuất bản' },
      { permission: 'pages.manageLive', label: 'Rollback, hoàn tác, gỡ trang khỏi live' },
    ],
  },
  {
    title: 'Leads',
    rows: [
      { permission: 'leads.view', label: 'Xem lead, khách hàng, pipeline' },
      { permission: 'leads.handle', label: 'Đổi trạng thái, ghi chú, giao việc' },
    ],
  },
  {
    title: 'Dữ liệu cá nhân',
    rows: [
      { permission: 'leads.export', label: 'Xuất lead ra CSV / Excel' },
      {
        permission: 'personalData.manage',
        label: 'Xử lý yêu cầu dữ liệu, sửa và xóa dữ liệu một người',
      },
      {
        permission: 'privacy.manage',
        label: 'Sửa nội dung đồng ý, thời gian lưu, nơi nhận lead',
      },
    ],
  },
  {
    title: 'Site',
    rows: [{ permission: 'sites.manage', label: 'Tạo site, sửa tên, logo và giao diện' }],
  },
  {
    title: 'Tên miền',
    rows: [{ permission: 'domains.manage', label: 'Xem và quản lý tên miền' }],
  },
  {
    title: 'Automation',
    rows: [
      { permission: 'automations.view', label: 'Xem automation và lịch sử chạy' },
      { permission: 'automations.manage', label: 'Tạo, bật, tạm dừng automation' },
    ],
  },
  {
    title: 'Thành viên',
    rows: [
      { permission: 'members.manage', label: 'Mời, đổi quyền, gỡ thành viên; xem vai trò & quyền' },
      { permission: 'accessRequests.decide', label: 'Duyệt yêu cầu đổi quyền' },
      { permission: 'workspace.transferOwnership', label: 'Chuyển quyền sở hữu workspace' },
    ],
  },
  {
    title: 'Thanh toán',
    rows: [
      { permission: 'billing.view', label: 'Xem gói và mức sử dụng' },
      { permission: 'billing.manage', label: 'Đổi gói, thanh toán, tải hóa đơn' },
    ],
  },
];

/**
 * Members per role in a workspace, for the role list of board 16. `counts` leaves out the holders
 * of custom roles, which board 16 counts with each custom role (ADR-024); `members` is everyone,
 * the count of "Thành viên" in the sidebar (ADR-028).
 */
export const roleCountsSchema = z.object({
  counts: z.record(roleSchema, z.number().int().nonnegative()),
  members: z.number().int().nonnegative(),
});
export type RoleCounts = z.infer<typeof roleCountsSchema>;
