import {
  type Asset,
  type AssetListResponse,
  type Composition,
  imageRefSchema,
  MAX_PAGES_PER_SITE,
  type PageListResponse,
  type PageSummary,
  type Seo,
  type Site,
} from '@plp/contracts';
import { collectLeaves } from '@plp/sections/schema';

/** Page size of the page and asset lists (the API maximum). */
export const LIST_LIMIT = 50;
/** A site has at most 200 pages, so the page list never needs more than four requests. */
const MAX_PAGE_REQUESTS = Math.ceil(MAX_PAGES_PER_SITE / LIST_LIMIT);
/** Upper bound when looking for the assets a draft uses in the newest-first library. */
const MAX_ASSET_REQUESTS = 6;

/** Every page of the site, for the page-link pickers (bounded by MAX_PAGES_PER_SITE). */
export async function loadAllPages(
  fetchPage: (cursor: string | null) => Promise<PageListResponse>,
): Promise<PageSummary[]> {
  const pages: PageSummary[] = [];
  let cursor: string | null = null;
  for (let request = 0; request < MAX_PAGE_REQUESTS; request += 1) {
    const response = await fetchPage(cursor);
    pages.push(...response.items);
    if (response.nextCursor === null) {
      break;
    }
    cursor = response.nextCursor;
  }
  return pages;
}

/** Asset ids the editor needs to draw: images in the draft, share image and site logo. */
export function referencedAssetIds(composition: Composition, seo: Seo, site: Site): Set<string> {
  const ids = new Set<string>();
  for (const section of composition.sections) {
    for (const leaf of collectLeaves(section)) {
      if (leaf.field.kind !== 'image') {
        continue;
      }
      const image = imageRefSchema.safeParse(leaf.value);
      if (image.success && image.data.assetId !== null) {
        ids.add(image.data.assetId);
      }
    }
  }
  for (const id of [seo.shareImageAssetId, site.logoAssetId, site.defaultShareImageAssetId]) {
    if (id !== null) {
      ids.add(id);
    }
  }
  return ids;
}

/**
 * The first page of the asset library, plus further pages while an asset used by the draft is
 * still missing (bounded). There is no "get assets by ids" endpoint in MVP A.
 */
export async function loadEditorAssets(
  needed: ReadonlySet<string>,
  fetchPage: (cursor: string | null) => Promise<AssetListResponse>,
): Promise<Asset[]> {
  const assets: Asset[] = [];
  const missing = new Set(needed);
  let cursor: string | null = null;
  for (let request = 0; request < MAX_ASSET_REQUESTS; request += 1) {
    const response = await fetchPage(cursor);
    for (const asset of response.items) {
      assets.push(asset);
      missing.delete(asset.id);
    }
    if (missing.size === 0 || response.nextCursor === null) {
      break;
    }
    cursor = response.nextCursor;
  }
  return assets;
}
