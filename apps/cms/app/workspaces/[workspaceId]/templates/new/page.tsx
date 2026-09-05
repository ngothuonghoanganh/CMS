import CmsShell from '../../../../cms-shell';
import TemplatesPage from '../../../../templates/templates-page';

export default async function NewTemplatePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return (
    <CmsShell workspaceId={workspaceId}>
      <TemplatesPage action="create" />
    </CmsShell>
  );
}
