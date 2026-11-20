import { can } from '@plp/contracts';
import type { ReactNode } from 'react';
import { WorkspacePlanProvider } from '../../../../features/billing/plan-context';
import { loadSiteContext } from '../../../../features/shell/site-context';

/**
 * The plan of the site's workspace for its full-screen flows (ADR-035): the read-only notice, and
 * a "Nâng cấp" only for who may open board 28. The pages load the same context, once per request.
 */
export default async function FocusSiteLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const { site, membership, plan } = await loadSiteContext(siteId);
  return (
    <WorkspacePlanProvider
      workspaceId={site.workspaceId}
      canViewBilling={can(membership.role, 'billing.view')}
      plan={plan}
    >
      {children}
    </WorkspacePlanProvider>
  );
}
