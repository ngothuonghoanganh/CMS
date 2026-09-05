import CmsShell from '../../../../../../cms-shell';
import CollectionsPage from '../../../../../../collections/collections-page';

export default async function NewCollectionPage({
  params,
}: {
  params: Promise<{ workspaceId: string; siteId: string }>;
}) {
  const { siteId, workspaceId } = await params;
  return (
    <CmsShell workspaceId={workspaceId}>
      <CollectionsPage collectionAction="create" siteId={siteId} />
    </CmsShell>
  );
}
