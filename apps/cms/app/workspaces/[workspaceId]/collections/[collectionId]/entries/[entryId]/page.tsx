import CollectionsPage from '../../../../../../collections/collections-page';

export default async function WorkspaceCollectionEntryPage({
  params,
}: {
  params: Promise<{ workspaceId: string; collectionId: string; entryId: string }>;
}) {
  const { collectionId, entryId } = await params;
  return <CollectionsPage collectionId={collectionId} entryId={entryId} />;
}
