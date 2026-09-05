import CmsShell from '../../../cms-shell';
import WorkflowsPage from '../../../workflows/workflows-page';

export default async function WorkspaceWorkflowsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return (
    <CmsShell workspaceId={workspaceId}>
      <WorkflowsPage />
    </CmsShell>
  );
}
