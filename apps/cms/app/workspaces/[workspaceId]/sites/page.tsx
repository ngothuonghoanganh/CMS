import CmsShell from '../../../cms-shell';
import SiteModulePage from '../../../sites/sites-page';

export default async function SitesPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return (
    <CmsShell workspaceId={workspaceId}>
      <SiteModulePage />
    </CmsShell>
  );
}
