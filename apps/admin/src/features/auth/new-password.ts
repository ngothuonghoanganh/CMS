import { z } from 'zod';

/** Says the second copy of a new password differs from the first. */
export const PASSWORDS_DIFFER = 'Hai mật khẩu chưa khớp';

/** "Nhập lại mật khẩu mới": compared with the new password on submit, never sent. */
export const confirmPasswordSchema = z.string().min(1, 'Nhập lại mật khẩu mới');
