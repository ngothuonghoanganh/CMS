import SeoPage from '../../../../../../../seo/seo-page';

export default async function PageSeoRoute({
  params,
}: {
  params: Promise<{ workspaceId: string; siteId: string; pageId: string }>;
}) {
  const { pageId, siteId } = await params;
  return <SeoPage pageId={pageId} siteId={siteId} />;
}
