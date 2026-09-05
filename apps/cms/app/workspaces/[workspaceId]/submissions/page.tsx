import CmsShell from '../../../cms-shell';
import SubmissionModulePage from '../../../submissions/submissions-page';

export default async function SubmissionsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return (
    <CmsShell workspaceId={workspaceId}>
      <SubmissionModulePage />
    </CmsShell>
  );
}
