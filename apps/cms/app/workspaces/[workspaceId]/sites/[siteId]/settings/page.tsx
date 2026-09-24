import SiteSettingsPage from '../../../../../site-settings/site-settings-page';

export default async function WebsiteSettingsPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  return <SiteSettingsPage siteId={siteId} />;
}
