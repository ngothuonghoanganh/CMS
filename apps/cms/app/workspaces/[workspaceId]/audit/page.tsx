import CmsShell from '../../../cms-shell';
import AuditModulePage from '../../../audit/audit-page';

export default async function AuditPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return (
    <CmsShell workspaceId={workspaceId}>
      <AuditModulePage />
    </CmsShell>
  );
}
