import CmsShell from '../../../cms-shell';
import DesignSystemPage from '../../../design-system/design-system-page';

export default async function WorkspaceDesignSystemPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return (
    <CmsShell workspaceId={workspaceId}>
      <DesignSystemPage />
    </CmsShell>
  );
}
