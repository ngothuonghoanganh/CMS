import CmsShell from '../../cms-shell';
import OverviewPage from '../../overview/overview-page';

export default async function WorkspaceOverviewPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return (
    <CmsShell workspaceId={workspaceId}>
      <OverviewPage />
    </CmsShell>
  );
}
