import CmsShell from '../../../../../cms-shell';
import TemplatesPage from '../../../../../templates/templates-page';

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ workspaceId: string; templateId: string }>;
}) {
  const { templateId, workspaceId } = await params;
  return (
    <CmsShell workspaceId={workspaceId}>
      <TemplatesPage action="edit" templateId={templateId} />
    </CmsShell>
  );
}
