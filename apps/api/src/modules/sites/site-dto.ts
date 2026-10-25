import type { Site } from '@plp/contracts';
import { confirmedRecipientsOf, type SiteRecord, sitePrivacyOf } from './site.schema.js';

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
    privacyConfigured: sitePrivacyOf(site) !== null,
    confirmedLeadRecipients: confirmedRecipientsOf(site).length,
    createdAt: site.createdAt.toISOString(),
  };
}
