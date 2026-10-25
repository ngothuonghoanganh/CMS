import { endpoints, type PageDetailResponse, seoFieldSchema, type Site } from '@plp/contracts';
import type { Metadata } from 'next';
import { loadAssetsByIds } from '../../../../../../../features/assets';
import { loadPageDetail } from '../../../../../../../features/page-header/load-page-detail';
import type { SeoFocus } from '../../../../../../../features/seo/SeoForm';
import { SeoScreen } from '../../../../../../../features/seo/SeoScreen';
import { loadSiteContext } from '../../../../../../../features/shell/site-context';
import { serverApi } from '../../../../../../../lib/server-api';

interface SeoPageProps {
  params: Promise<{ siteId: string; pageId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function focusOf(value: string | string[] | undefined): SeoFocus | null {
  if (value === 'slug') {
    return 'slug';
  }
  const field = seoFieldSchema.safeParse(value);
  return field.success ? field.data : null;
}

/** The share images the page shows: its own and the site default, looked up by id. */
async function loadShareImages(site: Site, detail: PageDetailResponse) {
  const ids = [detail.draft.seo.shareImageAssetId, site.defaultShareImageAssetId].filter(
    (id): id is string => id !== null,
  );
  const assets = await loadAssetsByIds(ids, (lookup) =>
    serverApi(endpoints.listAssets, [site.id], { query: { ids: lookup } }),
  );
  return { assets, loadedAt: Date.now() };
}

export async function generateMetadata({ params }: SeoPageProps): Promise<Metadata> {
  const { siteId, pageId } = await params;
  await loadSiteContext(siteId);
  const { page } = await loadPageDetail(siteId, pageId);
  return { title: `SEO & chia sẻ — ${page.title}` };
}

/** Screen 07: slug, search title and description, share image and indexing of the draft. */
export default async function SeoPage({ params, searchParams }: SeoPageProps) {
  const { siteId, pageId } = await params;
  const { site, membership } = await loadSiteContext(siteId);
  const detail = await loadPageDetail(siteId, pageId);
  const { assets, loadedAt } = await loadShareImages(site, detail);
  const focus = focusOf((await searchParams).focus);
  return (
    <SeoScreen
      initial={{ detail, site, assets, role: membership.role }}
      loadedAt={loadedAt}
      focus={focus}
    />
  );
}
