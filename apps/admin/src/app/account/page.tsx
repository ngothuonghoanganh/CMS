import { ToastProvider } from '@plp/ui';
import type { Metadata } from 'next';
import { AccountScreen } from '../../features/account/AccountScreen';
import { CenteredPage } from '../../features/shell/CenteredPage';
import { requireMe } from '../../lib/server-api';

export const metadata: Metadata = { title: 'Tài khoản' };

/**
 * The signed-in user's account (ADR-026). It belongs to no workspace, so it opens at whichever
 * admin address the sidebar was at.
 */
export default async function AccountPage() {
  const me = await requireMe('/account');
  return (
    <ToastProvider>
      <CenteredPage width="md">
        <AccountScreen user={me.user} />
      </CenteredPage>
    </ToastProvider>
  );
}
