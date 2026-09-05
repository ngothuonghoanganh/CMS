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
  const { collectionId, entryId, siteId } = await params;
  return (
    <CollectionsPage collectionId={collectionId} entryId={entryId} siteId={siteId} />
  );
}
