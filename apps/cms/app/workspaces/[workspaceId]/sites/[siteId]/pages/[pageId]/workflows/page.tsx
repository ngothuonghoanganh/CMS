import WorkflowsPage from '../../../../../../../workflows/workflows-page';

export default async function PageWorkflowsRoute({
  params,
}: {
  params: Promise<{ workspaceId: string; siteId: string; pageId: string }>;
}) {
  const { pageId } = await params;
  return <WorkflowsPage pageId={pageId} />;
}
