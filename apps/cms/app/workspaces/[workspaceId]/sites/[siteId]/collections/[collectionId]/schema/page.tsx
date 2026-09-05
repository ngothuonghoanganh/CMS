import CollectionsPage from '../../../../../../../collections/collections-page';

export default async function CollectionSchemaPage({
  params,
}: {
  params: Promise<{ workspaceId: string; siteId: string; collectionId: string }>;
}) {
  const { collectionId, siteId } = await params;
  return (
    <CollectionsPage
      collectionAction="schema"
      collectionId={collectionId}
      siteId={siteId}
    />
  );
}
