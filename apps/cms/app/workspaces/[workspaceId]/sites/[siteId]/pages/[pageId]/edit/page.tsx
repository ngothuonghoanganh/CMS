import CmsShell from '../../../../../../../cms-shell';
import PagesPage from '../../../../../../../pages/pages-page';

export default async function EditPageRoute({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; siteId: string; pageId: string }>;
  searchParams: Promise<{ previewEntryId?: string }>;
}) {
  const { pageId, siteId, workspaceId } = await params;
  const { previewEntryId } = await searchParams;
  return (
    <CmsShell workspaceId={workspaceId}>
      <PagesPage
        action="edit"
        pageId={pageId}
        siteId={siteId}
        {...(previewEntryId ? { previewEntryId } : {})}
      />
    </CmsShell>
  );
}
