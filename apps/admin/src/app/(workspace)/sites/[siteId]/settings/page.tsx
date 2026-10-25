import { type Asset, endpoints, type Site } from '@plp/contracts';
import type { Metadata } from 'next';
import { loadAssetsByIds } from '../../../../../features/assets';
import { PageContainer, PageHeader } from '../../../../../features/shell/PageHeader';
import { loadSiteContext } from '../../../../../features/shell/site-context';
import { SiteSettingsForm } from '../../../../../features/site-settings/SiteSettingsForm';
import { serverApi } from '../../../../../lib/server-api';

interface SettingsPageProps {
  params: Promise<{ siteId: string }>;
}

/** The logo and the default share image, looked up by id. */
function loadSiteImages(site: Site): Promise<Asset[]> {
  const ids = [site.logoAssetId, site.defaultShareImageAssetId].filter(
    (id): id is string => id !== null,
  );
  return loadAssetsByIds(ids, (lookup) =>
    serverApi(endpoints.listAssets, [site.id], { query: { ids: lookup } }),
  );
}

export async function generateMetadata({ params }: SettingsPageProps): Promise<Metadata> {
  const { site } = await loadSiteContext((await params).siteId);
  return { title: `Cài đặt site — ${site.name}` };
}

export default async function SiteSettingsPage({ params }: SettingsPageProps) {
  const { site, membership } = await loadSiteContext((await params).siteId);
  const assets = await loadSiteImages(site);
  return (
    <PageContainer width="narrow">
      <PageHeader
        title="Cài đặt site"
        description={`Tên, giao diện, logo và ảnh chia sẻ mặc định dùng cho mọi trang của ${site.name}.`}
      />
      <SiteSettingsForm site={site} assets={assets} canEdit={membership.role === 'owner'} />
    </PageContainer>
  );
}
