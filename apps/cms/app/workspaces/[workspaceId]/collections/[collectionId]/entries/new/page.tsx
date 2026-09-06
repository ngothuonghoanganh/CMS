import CollectionsPage from '../../../../../../collections/collections-page';

export default async function NewWorkspaceCollectionEntryPage({
  params,
}: {
  params: Promise<{ workspaceId: string; collectionId: string }>;
}) {
  const { collectionId } = await params;
  return <CollectionsPage collectionId={collectionId} entryAction="create" />;
}
