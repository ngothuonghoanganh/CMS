import SitesPage from '../../../../sites/sites-page';

export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ workspaceId: string; siteId: string }>;
}) {
  const { siteId } = await params;
  return <SitesPage siteId={siteId} />;
}
