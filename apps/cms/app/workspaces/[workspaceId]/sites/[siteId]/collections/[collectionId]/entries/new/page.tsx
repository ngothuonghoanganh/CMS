import CmsShell from '../../../../../../../../cms-shell';
import CollectionsPage from '../../../../../../../../collections/collections-page';

export default async function NewCollectionEntryPage({
  params,
}: {
  params: Promise<{ workspaceId: string; siteId: string; collectionId: string }>;
}) {
  const { collectionId, siteId, workspaceId } = await params;
  return (
    <CmsShell workspaceId={workspaceId}>
      <CollectionsPage collectionId={collectionId} entryAction="create" siteId={siteId} />
    </CmsShell>
  );
}
