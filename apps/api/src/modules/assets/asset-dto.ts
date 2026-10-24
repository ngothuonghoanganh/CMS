import type { Asset, UserRef } from '@plp/contracts';
import type { AssetRecord } from './asset.schema.js';

/** Maps a stored asset to the contract `Asset`; the storage key itself stays internal. */
export function toAssetDto(record: AssetRecord, url: string, uploadedBy: UserRef): Asset {
  return {
    id: record._id.toHexString(),
    siteId: record.siteId.toHexString(),
    url,
    mimeType: record.mimeType,
    bytes: record.bytes,
    width: record.width,
    height: record.height,
    alt: record.alt,
    decorative: record.decorative,
    uploadedBy,
    createdAt: record.createdAt.toISOString(),
  };
}
