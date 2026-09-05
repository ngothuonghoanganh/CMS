import CmsShell from '../../../../cms-shell';
import SitesPage from '../../../../sites/sites-page';

export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ workspaceId: string; siteId: string }>;
}) {
  const { siteId, workspaceId } = await params;
  return (
    <CmsShell workspaceId={workspaceId}>
      <SitesPage siteId={siteId} />
    </CmsShell>
  );
}
