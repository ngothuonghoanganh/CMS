import CmsShell from '../../../cms-shell';
import CollectionsPage from '../../../collections/collections-page';

export default async function WorkspaceCollectionsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return (
    <CmsShell workspaceId={workspaceId}>
      <CollectionsPage />
    </CmsShell>
  );
}
