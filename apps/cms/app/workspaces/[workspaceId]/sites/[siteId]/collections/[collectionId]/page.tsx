import CollectionsPage from '../../../../../../collections/collections-page';

export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ workspaceId: string; siteId: string; collectionId: string }>;
}) {
  const { collectionId, siteId } = await params;
  return <CollectionsPage collectionId={collectionId} siteId={siteId} />;
}
