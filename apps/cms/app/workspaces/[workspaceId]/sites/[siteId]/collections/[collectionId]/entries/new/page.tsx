import CollectionsPage from '../../../../../../../../collections/collections-page';

export default async function NewCollectionEntryPage({
  params,
}: {
  params: Promise<{ workspaceId: string; siteId: string; collectionId: string }>;
}) {
  const { collectionId, siteId } = await params;
  return (
    <CollectionsPage collectionId={collectionId} entryAction="create" siteId={siteId} />
  );
}
