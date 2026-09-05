import SeoPage from '../../../../../seo/seo-page';

export default async function SiteSeoPage({
  params,
}: {
  params: Promise<{ workspaceId: string; siteId: string }>;
}) {
  const { siteId } = await params;
  return <SeoPage siteId={siteId} />;
}
