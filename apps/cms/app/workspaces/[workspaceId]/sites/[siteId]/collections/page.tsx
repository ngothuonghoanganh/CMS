import CollectionsPage from '../../../../../collections/collections-page';

export default async function SiteCollectionsPage({
  params,
}: {
  params: Promise<{ workspaceId: string; siteId: string }>;
}) {
  const { siteId } = await params;
  return <CollectionsPage siteId={siteId} />;
}
