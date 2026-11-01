import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { authPageHref, safeNextPath } from '../../../features/auth/next-path';
import { SignupForm } from '../../../features/auth/SignupForm';
import { currentAddress } from '../../../features/shell/current-address';
import { FormCard } from '../../../features/shell/FormCard';

export const metadata: Metadata = { title: 'Tạo tài khoản' };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const next = safeNextPath((await searchParams).next);
  // A new account makes a workspace of its own: it signs up at the common address, never at
  // another workspace's (ADR-025).
  const address = await currentAddress();
  if (address.kind === 'workspace') {
    redirect(`${address.addresses.commonOrigin}/signup`);
  }
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
