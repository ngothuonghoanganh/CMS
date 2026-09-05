import CmsShell from '../../../cms-shell';
import RoleModulePage from '../../../roles/roles-page';

export default async function RolesPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return (
    <CmsShell workspaceId={workspaceId}>
      <RoleModulePage />
    </CmsShell>
  );
}
