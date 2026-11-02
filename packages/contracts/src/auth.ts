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

/**
 * The first step of a sign-up (ADR-026): who signs up, and the workspace's name. No password:
 * whoever opens the emailed link proves the mailbox and chooses it there. Strict, so a client that
 * still sends a password is told so instead of having it dropped.
 */
export const signupRequestSchema = z.strictObject({
  name: personNameSchema,
  email: emailSchema,
  workspaceName: workspaceNameSchema,
});
export type SignupRequest = z.infer<typeof signupRequestSchema>;

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Nhập mật khẩu').max(128),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

// The account (ADR-026): a sign-up confirmed by email, a forgotten password, a changed one.

/** A sign-up's confirmation link works this many hours, once. */
export const SIGNUP_LINK_VALID_HOURS = 24;

/** A password reset link works this many minutes, once. */
export const RESET_LINK_VALID_MINUTES = 60;

/**
 * Account emails one address receives per hour, all kinds together: confirmation, sent again,
 * password reset and "already has an account".
 */
export const ACCOUNT_EMAILS_PER_HOUR = 3;

/** Admin pages of the account links; their secret travels in the URL fragment (`#token=`). */
export const SIGNUP_VERIFY_PATH = '/signup/verify';
export const RESET_PASSWORD_PATH = '/reset-password';
export const FORGOT_PASSWORD_PATH = '/forgot-password';

/** The secret of an account link. A wrong one is an invalid link (410), not a malformed request. */
const accountLinkTokenSchema = z.string().min(1).max(200);

/** Where an account email goes; the answer is the same whether the email has an account or not. */
export const accountEmailResponseSchema = z.object({ email: z.string() });
export type AccountEmailResponse = z.infer<typeof accountEmailResponseSchema>;

/** "Gửi lại" of a sign-up, and "Quên mật khẩu". */
export const accountEmailRequestSchema = z.object({ email: emailSchema });
export type AccountEmailRequest = z.infer<typeof accountEmailRequestSchema>;

/** The sign-up a confirmation link names, for its page; nothing is used up. */
export const signupLookupRequestSchema = z.object({ token: accountLinkTokenSchema });
export type SignupLookupRequest = z.infer<typeof signupLookupRequestSchema>;

/** What the form stored: the email, shown as it is, and the names the page lets one edit. */
export const signupLookupResponseSchema = z.object({
  email: z.string(),
  name: z.string(),
  workspaceName: z.string(),
});
export type SignupLookupResponse = z.infer<typeof signupLookupResponseSchema>;

/**
 * The link's page creates the account: whoever holds the link chooses its password, and may
 * correct the names typed in the form.
 */
export const signupVerifyRequestSchema = z.object({
  token: accountLinkTokenSchema,
  password: passwordSchema,
  name: personNameSchema,
  workspaceName: workspaceNameSchema,
});
export type SignupVerifyRequest = z.infer<typeof signupVerifyRequestSchema>;

export const resetPasswordRequestSchema = z.object({
  token: accountLinkTokenSchema,
  password: passwordSchema,
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1, 'Nhập mật khẩu hiện tại').max(128),
  newPassword: passwordSchema,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

/** The display name, with the limits of sign-up. */
export const updateMeRequestSchema = z.object({ name: personNameSchema });
export type UpdateMeRequest = z.infer<typeof updateMeRequestSchema>;

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
