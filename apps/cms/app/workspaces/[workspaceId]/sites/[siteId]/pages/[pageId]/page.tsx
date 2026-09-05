import CmsShell from '../../../../../../cms-shell';
import PagesPage from '../../../../../../pages/pages-page';

export default async function PageDetailRoute({
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
        pageId={pageId}
        siteId={siteId}
        {...(previewEntryId ? { previewEntryId } : {})}
      />
    </CmsShell>
  );
}
