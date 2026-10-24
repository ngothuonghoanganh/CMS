import { type Asset, endpoints, type Site } from '@plp/contracts';
import type { Metadata } from 'next';
import { LIST_LIMIT, loadEditorAssets } from '../../../../../features/editor';
import { PageContainer, PageHeader } from '../../../../../features/shell/PageHeader';
import { loadSiteContext } from '../../../../../features/shell/site-context';
import { SiteSettingsForm } from '../../../../../features/site-settings/SiteSettingsForm';
import { serverApi } from '../../../../../lib/server-api';

interface SettingsPageProps {
  params: Promise<{ siteId: string }>;
}

/** The logo and the default share image (bounded scan of the newest-first library). */
async function loadSiteImages(site: Site): Promise<Asset[]> {
  const ids = new Set<string>();
  for (const id of [site.logoAssetId, site.defaultShareImageAssetId]) {
    if (id !== null) {
      ids.add(id);
    }
  }
  if (ids.size === 0) {
    return [];
  }
  const assets = await loadEditorAssets(ids, (cursor) =>
    serverApi(endpoints.listAssets, [site.id], {
      query: { limit: LIST_LIMIT, ...(cursor === null ? {} : { cursor }) },
    }),
  );
  return assets.filter((asset) => ids.has(asset.id));
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
