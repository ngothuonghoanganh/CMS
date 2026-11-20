import {
  can,
  endpoints,
  holdersOf,
  METHOD_SETUP_RESULT_PARAM,
  methodSetupResultSchema,
} from '@plp/contracts';
import type { Metadata } from 'next';
import { BillingScreen } from '../../../../../features/billing/BillingScreen';
import { siteHref } from '../../../../../features/shell/navigation';
import { NoPermission } from '../../../../../features/shell/NoPermission';
import { loadWorkspaceContext } from '../../../../../features/shell/workspace-context';
import { serverApi } from '../../../../../lib/server-api';

interface BillingPageProps {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: BillingPageProps): Promise<Metadata> {
  const { membership } = await loadWorkspaceContext((await params).workspaceId);
  return { title: `Gói dịch vụ — ${membership.workspace.name}` };
}

/** The summary, the plans to compare, and when they were read. */
async function loadBilling(workspaceId: string) {
  const [summary, catalog] = await Promise.all([
    serverApi(endpoints.getBillingSummary, [workspaceId]),
    serverApi(endpoints.getPlanCatalog, []),
  ]);
  return { summary, catalog, loadedAt: Date.now() };
}

/** Board 28: the plan, its state, the usage of each limit and the comparison of plans (ADR-035). */
export default async function BillingPage({ params, searchParams }: BillingPageProps) {
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
  const { summary, catalog, loadedAt } = await loadBilling(workspaceId);
  const returned = methodSetupResultSchema.safeParse(
    (await searchParams)[METHOD_SETUP_RESULT_PARAM],
  );
  return (
    <BillingScreen
      workspaceId={workspaceId}
      workspaceName={membership.workspace.name}
      canManage={can(membership.role, 'billing.manage')}
      initial={summary}
      catalog={catalog}
      loadedAt={loadedAt}
      returned={returned.success ? returned.data : null}
    />
  );
}
