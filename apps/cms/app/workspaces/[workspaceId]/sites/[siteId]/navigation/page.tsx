import CmsShell from '../../../../../cms-shell';
import NavigationPage from '../../../../../navigation/navigation-page';

export default async function SiteNavigationPage({
  params,
}: {
  params: Promise<{ workspaceId: string; siteId: string }>;
}) {
  const { siteId, workspaceId } = await params;
  return (
    <CmsShell workspaceId={workspaceId}>
      <NavigationPage siteId={siteId} />
    </CmsShell>
  );
}
