import CollectionsPage from '../../../../../collections/collections-page';

export default async function WorkspaceCollectionSchemaPage({
  params,
}: {
  params: Promise<{ workspaceId: string; collectionId: string }>;
}) {
  const { collectionId } = await params;
  return <CollectionsPage collectionAction="schema" collectionId={collectionId} />;
}
