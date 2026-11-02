import { SIGNUP_VERIFY_PATH } from '@plp/contracts';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { VerifySignup } from '../../../../features/auth/VerifySignup';
import { currentAddress } from '../../../../features/shell/current-address';
import { FormCard } from '../../../../features/shell/FormCard';

export const metadata: Metadata = {
  title: 'Xác nhận email',
  // The link carries a secret in its fragment; nothing here should be indexed.
  robots: { index: false, follow: false },
};

/**
 * The page a sign-up's confirmation email links to (ADR-026), where the password is chosen. No
 * session is needed, and opening it only looks the sign-up up: a link scanner does not use it up.
 */
export default async function VerifySignupPage() {
  // Like signing up, at the common address: the new workspace opens from there at its own. The
  // browser keeps the fragment, and its secret, through the redirect.
  const address = await currentAddress();
  if (address.kind === 'workspace') {
    redirect(`${address.addresses.commonOrigin}${SIGNUP_VERIFY_PATH}`);
  }
  return (
    <FormCard
      title="Xác nhận email"
      description="Đặt mật khẩu để xác nhận email. Tài khoản và workspace của bạn được tạo ngay sau đó."
    >
      <VerifySignup />
    </FormCard>
  );
}
