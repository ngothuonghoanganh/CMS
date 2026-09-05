import TemplatesPage from '../../../../../templates/templates-page';

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ workspaceId: string; templateId: string }>;
}) {
  const { templateId } = await params;
  return <TemplatesPage action="edit" templateId={templateId} />;
}
