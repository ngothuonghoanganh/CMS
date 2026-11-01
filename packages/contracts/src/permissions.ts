import { z } from 'zod';
import { type Role, roleLabels, roleSchema } from './auth.js';

/**
 * What a member may do, one value per row of board 16 (ADR-020). Every site-scoped endpoint names
 * the permission it needs, and the admin hides what a role cannot do with the same table.
 */
export const permissionSchema = z.enum([
  'pages.view',
  'pages.edit',
  'pages.publish',
  'pages.manageLive',
  'leads.view',
  'leads.handle',
  'leads.export',
  'personalData.manage',
  'privacy.manage',
  'sites.manage',
  'domains.manage',
  'members.manage',
  'accessRequests.decide',
  'workspace.transferOwnership',
]);
export type Permission = z.infer<typeof permissionSchema>;

/** Duyệt yêu cầu đổi quyền and the ownership stay with Chủ sở hữu (ADR-021). */
const ownerOnly: readonly Permission[] = ['accessRequests.decide', 'workspace.transferOwnership'];

/**
 * The permissions of each role. "Xem lead" and "Xuất / xóa dữ liệu cá nhân" are separate rows:
 * Chăm sóc khách hàng handles leads but never exports or deletes a person's data.
 */
const grants: Record<Role, readonly Permission[]> = {
  owner: permissionSchema.options,
  admin: permissionSchema.options.filter((permission) => !ownerOnly.includes(permission)),
  editor: ['pages.view', 'pages.edit', 'pages.publish', 'pages.manageLive'],
  contributor: ['pages.view', 'pages.edit'],
  support: ['pages.view', 'leads.view', 'leads.handle'],
  viewer: ['pages.view'],
};

export function can(role: Role, permission: Permission): boolean {
  return grants[role].includes(permission);
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

export interface PermissionGroup {
  title: string;
  rows: readonly { permission: Permission; label: string }[];
}

/** Rows of board 16 in its order, only for what the product does today. */
export const permissionGroups: readonly PermissionGroup[] = [
  {
    title: 'Nội dung',
    rows: [
      { permission: 'pages.view', label: 'Xem trang, bản nháp và hiệu quả' },
      { permission: 'pages.edit', label: 'Sửa bản nháp, section, SEO, tải ảnh lên' },
    ],
  },
  {
    title: 'Xuất bản',
    rows: [
      { permission: 'pages.publish', label: 'Xuất bản, cập nhật trang live' },
      { permission: 'pages.manageLive', label: 'Rollback, hoàn tác, gỡ trang khỏi live' },
    ],
  },
  {
    title: 'Leads',
    rows: [
      { permission: 'leads.view', label: 'Xem lead và nơi nhận lead' },
      { permission: 'leads.handle', label: 'Đổi trạng thái, ghi chú, đánh dấu spam' },
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
    title: 'Thành viên',
    rows: [
      { permission: 'members.manage', label: 'Mời, đổi quyền, gỡ thành viên; xem vai trò & quyền' },
      { permission: 'accessRequests.decide', label: 'Duyệt yêu cầu đổi quyền' },
      { permission: 'workspace.transferOwnership', label: 'Chuyển quyền sở hữu workspace' },
    ],
  },
];

/** Members per role in a workspace, for the role list of board 16. */
export const roleCountsSchema = z.object({
  counts: z.record(roleSchema, z.number().int().nonnegative()),
});
export type RoleCounts = z.infer<typeof roleCountsSchema>;
