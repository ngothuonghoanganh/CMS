import CmsShell from '../../../../../cms-shell';
import PagesPage from '../../../../../pages/pages-page';

export default async function SitePagesPage({
  params,
}: {
  params: Promise<{ workspaceId: string; siteId: string }>;
}) {
  const { siteId, workspaceId } = await params;
  return (
    <CmsShell workspaceId={workspaceId}>
      <PagesPage siteId={siteId} />
    </CmsShell>
  );
}
