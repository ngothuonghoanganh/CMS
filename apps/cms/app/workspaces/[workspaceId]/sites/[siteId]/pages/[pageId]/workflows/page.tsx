import CmsShell from '../../../../../../../cms-shell';
import WorkflowsPage from '../../../../../../../workflows/workflows-page';

export default async function PageWorkflowsRoute({
  params,
}: {
  params: Promise<{ workspaceId: string; siteId: string; pageId: string }>;
}) {
  const { pageId, workspaceId } = await params;
  return (
    <CmsShell workspaceId={workspaceId}>
      <WorkflowsPage pageId={pageId} />
    </CmsShell>
  );
}
