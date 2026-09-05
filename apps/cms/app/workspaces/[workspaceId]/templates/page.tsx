import CmsShell from '../../../cms-shell';
import TemplateModulePage from '../../../templates/templates-page';

export default async function TemplatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams?: Promise<{ siteId?: string | string[] }>;
}) {
  const { workspaceId } = await params;
  const query = searchParams ? await searchParams : {};
  const siteId = Array.isArray(query.siteId) ? query.siteId[0] : query.siteId;
  return (
    <CmsShell workspaceId={workspaceId}>
      <TemplateModulePage {...(siteId ? { siteId } : {})} />
    </CmsShell>
  );
}
