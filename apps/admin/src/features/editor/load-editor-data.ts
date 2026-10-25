import {
  type Composition,
  imageRefSchema,
  MAX_PAGES_PER_SITE,
  type PageListResponse,
  type PageSummary,
  type Seo,
  type Site,
} from '@plp/contracts';
import { collectLeaves } from '@plp/sections/schema';

/** Page size of the page list (the API maximum). */
export const LIST_LIMIT = 50;
/** A site has at most 200 pages, so the page list never needs more than four requests. */
const MAX_PAGE_REQUESTS = Math.ceil(MAX_PAGES_PER_SITE / LIST_LIMIT);

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

/**
 * Asset ids the editor needs to draw: images in the draft, share image and site logo. Images in
 * fields the current variant hides count too: switching back to a variant that shows them must not
 * report them as missing from the library.
 */
export function referencedAssetIds(composition: Composition, seo: Seo, site: Site): Set<string> {
  const ids = new Set<string>();
  for (const section of composition.sections) {
    for (const leaf of collectLeaves(section, { includeHidden: true })) {
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
