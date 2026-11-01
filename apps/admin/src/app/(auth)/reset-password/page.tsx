import type { Metadata } from 'next';
import { ResetPasswordForm } from '../../../features/auth/ResetPasswordForm';
import { FormCard } from '../../../features/shell/FormCard';

export const metadata: Metadata = {
  title: 'Đặt mật khẩu mới',
  // The link carries a secret in its fragment; nothing here should be indexed.
  robots: { index: false, follow: false },
};

/** The page a password reset email links to (ADR-026); no session needed. */
export default function ResetPasswordPage() {
  return (
    <FormCard
      title="Đặt mật khẩu mới"
      description="Đặt mật khẩu mới cho tài khoản. Mọi thiết bị đang đăng nhập sẽ bị đăng xuất, rồi bạn vào trang quản trị ngay."
    >
      <ResetPasswordForm />
    </FormCard>
  );
}
