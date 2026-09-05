import PagesPage from '../../../../../../pages/pages-page';

export default async function PageDetailRoute({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; siteId: string; pageId: string }>;
  searchParams: Promise<{ previewEntryId?: string }>;
}) {
  const { pageId, siteId } = await params;
  const { previewEntryId } = await searchParams;
  return (
    <PagesPage
      pageId={pageId}
      siteId={siteId}
      {...(previewEntryId ? { previewEntryId } : {})}
    />
  );
}
