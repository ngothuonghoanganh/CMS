import CmsShell from '../../../../../../cms-shell';
import PagesPage from '../../../../../../pages/pages-page';

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function NewPageRoute({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; siteId: string }>;
  searchParams?: Promise<{
    templateId?: string | string[];
    templateVersionId?: string | string[];
  }>;
}) {
  const { siteId, workspaceId } = await params;
  const query = searchParams ? await searchParams : {};
  const templateId = first(query.templateId);
  const templateVersionId = first(query.templateVersionId);
  return (
    <CmsShell workspaceId={workspaceId}>
      <PagesPage
        action="create"
        siteId={siteId}
        {...(templateId ? { templateId } : {})}
        {...(templateVersionId ? { templateVersionId } : {})}
      />
    </CmsShell>
  );
}
