import { can, endpoints, holdersOf, idSchema } from '@plp/contracts';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ReceiptView } from '../../../../../../../features/billing/ReceiptView';
import { billingHref } from '../../../../../../../features/shell/navigation';
import { NoPermission } from '../../../../../../../features/shell/NoPermission';
import { loadWorkspaceContext } from '../../../../../../../features/shell/workspace-context';
import { ApiError } from '../../../../../../../lib/api-core';
import { serverApi } from '../../../../../../../lib/server-api';

interface ReceiptPageProps {
  params: Promise<{ workspaceId: string; invoiceId: string }>;
}

export const metadata: Metadata = {
  title: 'Biên nhận thanh toán',
  // A receipt is private to the workspace's owner.
  robots: { index: false },
};

async function loadReceipt(workspaceId: string, invoiceId: string) {
  try {
    return await serverApi(endpoints.getInvoiceReceipt, [workspaceId, invoiceId]);
  } catch (error) {
    // Only a paid invoice of this workspace has a receipt: any other is not found.
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }
}

/** The printable receipt of a paid invoice, with no sidebar (ADR-035, T2). */
export default async function ReceiptPage({ params }: ReceiptPageProps) {
  const { workspaceId, invoiceId } = await params;
  if (!idSchema.safeParse(invoiceId).success) {
    notFound();
  }
  const { membership } = await loadWorkspaceContext(workspaceId);
  if (!can(membership.role, 'billing.manage')) {
    return (
      <main id="main-content">
        <NoPermission
          title="Chỉ Chủ sở hữu xem được thanh toán"
          membership={membership}
          holders={`Chỉ ${holdersOf('billing.manage')} xem được hóa đơn.`}
          back={{ href: billingHref(workspaceId), label: 'Về gói dịch vụ' }}
        />
      </main>
    );
  }
  const receipt = await loadReceipt(workspaceId, invoiceId);
  return <ReceiptView workspaceId={workspaceId} receipt={receipt} />;
}
