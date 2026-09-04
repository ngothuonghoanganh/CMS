import { notFound } from 'next/navigation';

import TemplateBuilderShell from '../../../../../../../../builder/template-builder-shell';

type TemplateBuilderPageProps = {
  params: Promise<{
    workspaceId: string;
    siteId: string;
    templateId: string;
  }>;
};

export default async function TemplateBuilderPage({ params }: TemplateBuilderPageProps) {
  const { workspaceId, siteId, templateId } = await params;
  if (!workspaceId || !siteId || !templateId) notFound();
  return (
    <TemplateBuilderShell
      siteId={siteId}
      templateId={templateId}
      workspaceId={workspaceId}
    />
  );
}
