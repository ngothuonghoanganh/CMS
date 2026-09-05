import CmsShell from '../../../cms-shell';
import NavigationPage from '../../../navigation/navigation-page';

export default async function WorkspaceNavigationPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return (
    <CmsShell workspaceId={workspaceId}>
      <NavigationPage />
    </CmsShell>
  );
}
