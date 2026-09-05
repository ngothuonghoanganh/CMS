import NavigationPage from '../../../../../navigation/navigation-page';

export default async function SiteNavigationPage({
  params,
}: {
  params: Promise<{ workspaceId: string; siteId: string }>;
}) {
  const { siteId } = await params;
  return <NavigationPage siteId={siteId} />;
}
