import { type Asset, type AssetListResponse, MAX_ASSET_IDS_PER_LOOKUP } from '@plp/contracts';

/**
 * The assets with these ids, through the `ids` lookup of the asset list (at most 50 ids per
 * request, so a draft with more images takes a few requests). Ids the API does not return (deleted
 * or of another site) are simply missing from the result.
 */
export async function loadAssetsByIds(
  ids: Iterable<string>,
  lookup: (ids: string) => Promise<AssetListResponse>,
): Promise<Asset[]> {
  const unique = [...new Set(ids)];
  const chunks: string[][] = [];
  for (let start = 0; start < unique.length; start += MAX_ASSET_IDS_PER_LOOKUP) {
    chunks.push(unique.slice(start, start + MAX_ASSET_IDS_PER_LOOKUP));
  }
  const responses = await Promise.all(chunks.map((chunk) => lookup(chunk.join(','))));
  return responses.flatMap((response) => response.items);
}
