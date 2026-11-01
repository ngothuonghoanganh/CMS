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
 * The page a sign-up's confirmation email links to (ADR-026). No session is needed, and nothing
 * happens by merely opening it: a link scanner does not use the link up.
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
      description="Bấm nút dưới đây để xác nhận email. Workspace của bạn được tạo ngay sau đó."
    >
      <VerifySignup />
    </FormCard>
  );
}
