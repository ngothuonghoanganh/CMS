import { can, endpoints } from '@plp/contracts';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { AutomationRuns } from '../../../../../../../features/automations/AutomationRuns';
import { loadAutomationRunsData } from '../../../../../../../features/automations/load-automation';
import { requireWorkspaceAddress } from '../../../../../../../features/shell/current-address';
import { ApiError } from '../../../../../../../lib/api-core';
import { requireMe, serverApi } from '../../../../../../../lib/server-api';

interface AutomationRunsPageProps {
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
  requireMe(`/sites/${siteId}/automations/${automationId}/runs`),
);
const loadAutomation = cache((siteId: string, automationId: string) =>
  serverApi(endpoints.getAutomation, [siteId, automationId]),
);

export async function generateMetadata({ params }: AutomationRunsPageProps): Promise<Metadata> {
  const { siteId, automationId } = await params;
  await authorize(siteId, automationId);
  const automation = await orNotFound(loadAutomation(siteId, automationId));
  return { title: `Lịch sử chạy “${automation.name}”` };
}

/** Screen 27: an automation's runs, step by step, with retry and skip (ADR-034). */
export default async function AutomationRunsPage({ params }: AutomationRunsPageProps) {
  const { siteId, automationId } = await params;
  const me = await authorize(siteId, automationId);
  const { automation, runs, site, loadedAt } = await orNotFound(
    loadAutomationRunsData(siteId, loadAutomation(siteId, automationId)),
  );
  const membership = me.memberships.find((item) => item.workspace.id === site.workspaceId);
  if (!membership) {
    notFound();
  }
  await requireWorkspaceAddress(membership.workspace);
  return (
    <AutomationRuns
      key={loadedAt}
      site={site}
      automation={automation}
      initial={runs}
      canManage={can(membership.role, 'automations.manage')}
      loadedAt={loadedAt}
    />
  );
}
