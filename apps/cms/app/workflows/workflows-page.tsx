'use client';

import { useCmsShell } from '../cms-shell';
import { WorkflowsView } from './workflows-view';

export default function WorkflowsPage({ pageId }: { pageId?: string }) {
  const { can, workspaceId } = useCmsShell();
  return (
    <WorkflowsView
      canEnable={can('workflow.enable') || can('workflow.disable')}
      canManage={can('workflow.create') && can('workflow.update')}
      canPublish={can('workflow.publish')}
      canReadExecutions={can('workflow.execution.read')}
      canRetry={can('workflow.execution.retry')}
      {...(pageId ? { pageId } : {})}
      workspaceId={workspaceId}
    />
  );
}
