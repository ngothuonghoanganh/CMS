import CollectionsPage from '../../../../../../../collections/collections-page';

export default async function EditWorkspaceCollectionEntryPage({
  params,
}: {
  params: Promise<{ workspaceId: string; collectionId: string; entryId: string }>;
}) {
  const { collectionId, entryId } = await params;
  return (
    <CollectionsPage collectionId={collectionId} entryAction="edit" entryId={entryId} />
  );
}
