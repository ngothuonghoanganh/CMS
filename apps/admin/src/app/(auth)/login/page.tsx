import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from '../../../features/auth/LoginForm';
import { authPageHref, safeNextPath } from '../../../features/auth/next-path';
import { workspaceHome } from '../../../features/shell/admin-address';
import { currentAddress } from '../../../features/shell/current-address';
import { FormCard } from '../../../features/shell/FormCard';
import addressStyles from '../../../features/workspaces/address.module.css';
import formStyles from '../../../features/auth/AuthForm.module.css';

export const metadata: Metadata = { title: 'Đăng nhập' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const next = safeNextPath((await searchParams).next);
  const address = await currentAddress();
  if (address.kind === 'single') {
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
  const { commonOrigin } = address.addresses;
  // Screen 34: the login says which address it opens (ADR-025). A new account makes its own
  // workspace, so signing up happens at the common address.
  return (
    <FormCard
      title="Đăng nhập"
      description={
        address.kind === 'workspace' ? (
          <>
            Bạn đang mở{' '}
            <span className={addressStyles.address}>
              {new URL(workspaceHome(address.addresses, address.slug)).host}
            </span>
            . Đăng nhập xong, workspace ở địa chỉ này mở ra ngay.
          </>
        ) : (
          'Đăng nhập xong, bạn chọn workspace muốn mở. Nếu chỉ thuộc một workspace, nó mở ra ngay.'
        )
      }
      footer={
        address.kind === 'workspace' ? (
          <>
            Một lần đăng nhập dùng được cho mọi workspace của bạn. Muốn mở workspace khác?{' '}
            <a href={`${commonOrigin}/`}>Xem tất cả workspace</a>
          </>
        ) : undefined
      }
    >
      <LoginForm next={next} />
      <p className={formStyles.switch}>
        Chưa có tài khoản? <a href={`${commonOrigin}/signup`}>Tạo workspace mới</a>
      </p>
    </FormCard>
  );
}
