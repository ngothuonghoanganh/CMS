import SitesPage from '../../../../../sites/sites-page';

export default async function EditSitePage({
  params,
}: {
  params: Promise<{ workspaceId: string; siteId: string }>;
}) {
  const { siteId } = await params;
  return <SitesPage action="edit" siteId={siteId} />;
}
