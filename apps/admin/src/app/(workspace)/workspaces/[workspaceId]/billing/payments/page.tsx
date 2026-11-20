import {
  accessLabel,
  can,
  endpoints,
  holdersOf,
  methodSetupResultSchema,
  METHOD_SETUP_RESULT_PARAM,
} from '@plp/contracts';
import type { Metadata } from 'next';
import { PaymentsDenied, PaymentsScreen } from '../../../../../../features/billing/PaymentsScreen';
import { INVOICE_PAGE_SIZE } from '../../../../../../features/billing/queries';
import { siteHref } from '../../../../../../features/shell/navigation';
import { NoPermission } from '../../../../../../features/shell/NoPermission';
import { loadWorkspaceContext } from '../../../../../../features/shell/workspace-context';
import { serverApi } from '../../../../../../lib/server-api';

interface PaymentsPageProps {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: PaymentsPageProps): Promise<Metadata> {
  const { membership } = await loadWorkspaceContext((await params).workspaceId);
  return { title: `Thanh toán & hóa đơn — ${membership.workspace.name}` };
}

/** The three cards of board 29 and when they were read. */
async function loadPayments(workspaceId: string) {
  const [paymentMethod, billingInfo, invoices] = await Promise.all([
    serverApi(endpoints.getPaymentMethod, [workspaceId]),
    serverApi(endpoints.getBillingInfo, [workspaceId]),
    serverApi(endpoints.listInvoices, [workspaceId], { query: { limit: INVOICE_PAGE_SIZE } }),
  ]);
  return { paymentMethod, billingInfo, invoices, loadedAt: Date.now() };
}

/**
 * Board 29: the saved card, the billing info and the transaction history (ADR-035, T2). Only
 * Chủ sở hữu (`billing.manage`) opens them; Quản trị sees the board's "notOwner" state.
 */
export default async function PaymentsPage({ params, searchParams }: PaymentsPageProps) {
  const { workspaceId } = await params;
  const { membership, site } = await loadWorkspaceContext(workspaceId);
  if (!can(membership.role, 'billing.view')) {
    return (
      <NoPermission
        title="Bạn chưa có quyền xem gói và thanh toán"
        membership={membership}
        holders={`Chỉ ${holdersOf('billing.view')} xem được gói và mức sử dụng của workspace.`}
        back={
          site === null
            ? { href: '/', label: 'Về trang chủ' }
            : { href: siteHref(site.id), label: 'Về danh sách trang' }
        }
        requestAccess
      />
    );
  }
  if (!can(membership.role, 'billing.manage')) {
    return (
      <PaymentsDenied
        workspaceId={workspaceId}
        roleLabel={accessLabel(membership.role)}
        holders={holdersOf('billing.manage')}
      />
    );
  }
  const initial = await loadPayments(workspaceId);
  const returned = methodSetupResultSchema.safeParse(
    (await searchParams)[METHOD_SETUP_RESULT_PARAM],
  );
  return (
    <PaymentsScreen
      workspaceId={workspaceId}
      workspaceName={membership.workspace.name}
      initial={initial}
      returned={returned.success ? returned.data : null}
    />
  );
}
