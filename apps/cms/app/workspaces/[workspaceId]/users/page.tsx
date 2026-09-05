import CmsShell from '../../../cms-shell';
import UserModulePage from '../../../users/users-page';

export default async function UsersPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return (
    <CmsShell workspaceId={workspaceId}>
      <UserModulePage />
    </CmsShell>
  );
}
