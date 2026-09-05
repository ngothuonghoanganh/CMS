import CmsShell from '../../../../../../../../../cms-shell';
import CollectionsPage from '../../../../../../../../../collections/collections-page';

export default async function EditCollectionEntryPage({
  params,
}: {
  params: Promise<{
    workspaceId: string;
    siteId: string;
    collectionId: string;
    entryId: string;
  }>;
}) {
  const { collectionId, entryId, siteId, workspaceId } = await params;
  return (
    <CmsShell workspaceId={workspaceId}>
      <CollectionsPage
        collectionId={collectionId}
        entryAction="edit"
        entryId={entryId}
        siteId={siteId}
      />
    </CmsShell>
  );
}
