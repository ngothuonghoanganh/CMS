import CmsShell from '../../../../cms-shell';
import SitesPage from '../../../../sites/sites-page';

export default async function NewSitePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return (
    <CmsShell workspaceId={workspaceId}>
      <SitesPage action="create" />
    </CmsShell>
  );
}
