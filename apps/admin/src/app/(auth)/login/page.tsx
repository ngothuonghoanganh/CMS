import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from '../../../features/auth/LoginForm';
import { authPageHref, safeNextPath } from '../../../features/auth/next-path';
import { FormCard } from '../../../features/shell/FormCard';

export const metadata: Metadata = { title: 'Đăng nhập' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const next = safeNextPath((await searchParams).next);
  return (
    <FormCard
      title="Đăng nhập"
      description="Quản lý landing page của các site khách hàng và xuất bản an toàn."
      footer={
        <>
          Chưa có tài khoản? <Link href={authPageHref('/signup', next)}>Tạo tài khoản</Link>
        </>
      }
    >
      <LoginForm next={next} />
    </FormCard>
  );
}
