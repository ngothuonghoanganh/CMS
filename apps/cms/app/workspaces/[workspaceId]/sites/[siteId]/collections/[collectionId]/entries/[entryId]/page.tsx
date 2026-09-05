import CmsShell from '../../../../../../../../cms-shell';
import CollectionsPage from '../../../../../../../../collections/collections-page';

export default async function CollectionEntryDetailPage({
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
      <CollectionsPage collectionId={collectionId} entryId={entryId} siteId={siteId} />
    </CmsShell>
  );
}
