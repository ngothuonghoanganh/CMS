import { can, endpoints } from '@plp/contracts';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { AutomationEditor } from '../../../../../../features/automations/AutomationEditor';
import { WorkspacePlanProvider } from '../../../../../../features/billing/plan-context';
import { loadAutomationData } from '../../../../../../features/automations/load-automation';
import { requireWorkspaceAddress } from '../../../../../../features/shell/current-address';
import { ApiError } from '../../../../../../lib/api-core';
import { requireMe, serverApi } from '../../../../../../lib/server-api';

interface AutomationPageProps {
  params: Promise<{ siteId: string; automationId: string }>;
}

/** Another workspace's automation, one that does not exist, or one the role cannot see: a 404. */
async function orNotFound<T>(load: Promise<T>): Promise<T> {
  try {
    return await load;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
      notFound();
    }
    throw error;
  }
}

const authorize = cache((siteId: string, automationId: string) =>
  requireMe(`/sites/${siteId}/automations/${automationId}`),
);
const loadAutomation = cache((siteId: string, automationId: string) =>
  serverApi(endpoints.getAutomation, [siteId, automationId]),
);

export async function generateMetadata({ params }: AutomationPageProps): Promise<Metadata> {
  const { siteId, automationId } = await params;
  await authorize(siteId, automationId);
  const automation = await orNotFound(loadAutomation(siteId, automationId));
  return { title: `Automation “${automation.name}”` };
}

/** Screen 26: an automation's steps, its test run and "Bật" (ADR-034). */
export default async function AutomationPage({ params }: AutomationPageProps) {
  const { siteId, automationId } = await params;
  const me = await authorize(siteId, automationId);
  const { automation, site, loadedAt } = await orNotFound(
    loadAutomationData(siteId, loadAutomation(siteId, automationId)),
  );
  const membership = me.memberships.find((item) => item.workspace.id === site.workspaceId);
  if (!membership) {
    notFound();
  }
  await requireWorkspaceAddress(membership.workspace);
  // The plan's monthly runs, the read-only notice and the way to board 28 (ADR-035).
  const plan = await serverApi(endpoints.getWorkspacePlan, [site.workspaceId]);
  return (
    <WorkspacePlanProvider
      workspaceId={site.workspaceId}
      canViewBilling={can(membership.role, 'billing.view')}
      plan={plan}
    >
      <AutomationEditor
        key={loadedAt}
        site={site}
        initial={automation}
        canManage={can(membership.role, 'automations.manage')}
        loadedAt={loadedAt}
      />
    </WorkspacePlanProvider>
  );
}
