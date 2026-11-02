import type { Metadata } from 'next';
import Link from 'next/link';
import { ForgotPasswordForm } from '../../../features/auth/ForgotPasswordForm';
import { FormCard } from '../../../features/shell/FormCard';

export const metadata: Metadata = { title: 'Quên mật khẩu' };

/** Linked from the login page (screen 34, ADR-026); no session needed. */
export default function ForgotPasswordPage() {
  return (
    <FormCard
      title="Quên mật khẩu"
      description="Nhập email của tài khoản. Chúng tôi sẽ gửi link để bạn đặt mật khẩu mới."
      footer={
        <>
          Nhớ ra mật khẩu? <Link href="/login">Đăng nhập</Link>
        </>
      }
    >
      <ForgotPasswordForm />
    </FormCard>
  );
}
