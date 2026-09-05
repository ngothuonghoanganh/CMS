import CmsShell from '../../../../../cms-shell';
import CollectionsPage from '../../../../../collections/collections-page';

export default async function SiteCollectionsPage({
  params,
}: {
  params: Promise<{ workspaceId: string; siteId: string }>;
}) {
  const { siteId, workspaceId } = await params;
  return (
    <CmsShell workspaceId={workspaceId}>
      <CollectionsPage siteId={siteId} />
    </CmsShell>
  );
}
