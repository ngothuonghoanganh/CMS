import type { Metadata } from 'next';
import Link from 'next/link';
import { authPageHref, safeNextPath } from '../../../features/auth/next-path';
import { SignupForm } from '../../../features/auth/SignupForm';
import { FormCard } from '../../../features/shell/FormCard';

export const metadata: Metadata = { title: 'Tạo tài khoản' };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const next = safeNextPath((await searchParams).next);
  return (
    <FormCard
      title="Tạo tài khoản"
      description="Tạo workspace cho agency hoặc doanh nghiệp của bạn, rồi thêm site khách hàng đầu tiên."
      footer={
        <>
          Đã có tài khoản? <Link href={authPageHref('/login', next)}>Đăng nhập</Link>
        </>
      }
    >
      <SignupForm next={next} />
    </FormCard>
  );
}
