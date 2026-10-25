import type { Site } from '@plp/contracts';
import type { SiteRecord } from './site.schema.js';

/** Maps a stored site to the contract `Site`; `defaultOrigin` comes from the origin template. */
export function toSiteDto(site: SiteRecord, defaultOrigin: string): Site {
  return {
    id: site._id.toHexString(),
    workspaceId: site.workspaceId.toHexString(),
    name: site.name,
    subdomain: site.subdomain,
    themePresetId: site.themePresetId,
    logoAssetId: site.logoAssetId?.toHexString() ?? null,
    defaultShareImageAssetId: site.defaultShareImageAssetId?.toHexString() ?? null,
    defaultOrigin,
    createdAt: site.createdAt.toISOString(),
  };
}
