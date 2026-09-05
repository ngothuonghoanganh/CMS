import CollectionsPage from '../../../../../../collections/collections-page';

export default async function NewCollectionPage({
  params,
}: {
  params: Promise<{ workspaceId: string; siteId: string }>;
}) {
  const { siteId } = await params;
  return <CollectionsPage collectionAction="create" siteId={siteId} />;
}
