import PagesPage from '../../../../../pages/pages-page';

export default async function SitePagesPage({
  params,
}: {
  params: Promise<{ workspaceId: string; siteId: string }>;
}) {
  const { siteId } = await params;
  return <PagesPage siteId={siteId} />;
}
