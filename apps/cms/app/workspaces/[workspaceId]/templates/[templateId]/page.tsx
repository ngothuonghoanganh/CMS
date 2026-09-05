import TemplatesPage from '../../../../templates/templates-page';

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ workspaceId: string; templateId: string }>;
}) {
  const { templateId } = await params;
  return <TemplatesPage templateId={templateId} />;
}
