import { z } from 'zod';
import { idSchema } from './common.js';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Email quá dài')
  .pipe(z.email('Email không hợp lệ'));

export const passwordSchema = z
  .string()
  .min(8, 'Mật khẩu cần ít nhất 8 ký tự')
  .max(128, 'Mật khẩu tối đa 128 ký tự');

export const personNameSchema = z
  .string()
  .trim()
  .min(1, 'Nhập họ và tên')
  .max(80, 'Họ và tên tối đa 80 ký tự');

export const workspaceNameSchema = z
  .string()
  .trim()
  .min(1, 'Nhập tên workspace')
  .max(80, 'Tên workspace tối đa 80 ký tự');

export const signupRequestSchema = z.object({
  name: personNameSchema,
  email: emailSchema,
  password: passwordSchema,
  workspaceName: workspaceNameSchema,
});
export type SignupRequest = z.infer<typeof signupRequestSchema>;

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Nhập mật khẩu').max(128),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** The six fixed roles of board 16, most powerful first (ADR-020). */
export const roleSchema = z.enum(['owner', 'admin', 'editor', 'contributor', 'support', 'viewer']);
export type Role = z.infer<typeof roleSchema>;

export const roleLabels: Record<Role, string> = {
  owner: 'Chủ sở hữu',
  admin: 'Quản trị',
  editor: 'Biên tập',
  contributor: 'Cộng tác viên',
  support: 'Chăm sóc khách hàng',
  viewer: 'Chỉ xem',
};

/** Roles that always cover every site of the workspace, including sites created later. */
export function roleCoversAllSites(role: Role): boolean {
  return role === 'owner' || role === 'admin';
}

/** The roles one can give or ask for: Chủ sở hữu changes hands only by a transfer. */
export const assignableRoleSchema = roleSchema.exclude(['owner']);
export type AssignableRole = z.infer<typeof assignableRoleSchema>;

export const sessionUserSchema = z.object({
  id: idSchema,
  name: z.string(),
  email: z.string(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

/** Name of the httpOnly session cookie set by the API on the admin origin. */
export const SESSION_COOKIE = 'plp_session';
