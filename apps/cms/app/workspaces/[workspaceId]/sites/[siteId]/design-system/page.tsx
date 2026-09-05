import DesignSystemPage from '../../../../../design-system/design-system-page';

export default async function SiteDesignSystemPage({
  params,
}: {
  params: Promise<{ workspaceId: string; siteId: string }>;
}) {
  const { siteId } = await params;
  return <DesignSystemPage siteId={siteId} />;
}
