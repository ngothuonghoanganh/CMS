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

export const roleSchema = z.enum(['owner', 'editor']);
export type Role = z.infer<typeof roleSchema>;

export const roleLabels: Record<Role, string> = {
  owner: 'Owner',
  editor: 'Editor',
};

export const sessionUserSchema = z.object({
  id: idSchema,
  name: z.string(),
  email: z.string(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const membershipSchema = z.object({
  workspace: z.object({ id: idSchema, name: z.string() }),
  role: roleSchema,
});
export type Membership = z.infer<typeof membershipSchema>;

export const meResponseSchema = z.object({
  user: sessionUserSchema,
  memberships: z.array(membershipSchema),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

/** Name of the httpOnly session cookie set by the API on the admin origin. */
export const SESSION_COOKIE = 'plp_session';
