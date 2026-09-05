import CmsShell from '../../../cms-shell';
import OrganizationModulePage from '../../../organization/organization-page';

export default async function OrganizationPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return (
    <CmsShell workspaceId={workspaceId}>
      <OrganizationModulePage />
    </CmsShell>
  );
}
