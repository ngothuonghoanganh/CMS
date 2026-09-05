import CmsShell from '../../../cms-shell';
import UiReferencePage from '../../../ui-reference/ui-reference-page';

export default async function WorkspaceAdminUiPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return (
    <CmsShell workspaceId={workspaceId}>
      <UiReferencePage />
    </CmsShell>
  );
}
