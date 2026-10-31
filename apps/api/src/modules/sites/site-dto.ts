import type { Site } from '@plp/contracts';
import { currentSitePresentation } from '../publishing/release-presentation.js';
import { confirmedRecipientsOf, type SiteRecord, sitePrivacyOf } from './site.schema.js';

/**
 * Maps a stored site to the contract `Site`; `defaultOrigin` comes from the origin template. The
 * look (name, theme, logo, share image) is exactly what the next publish snapshots (ADR-015), so
 * the settings screen and the "site changed" reminders never disagree.
 */
export function toSiteDto(site: SiteRecord, defaultOrigin: string): Site {
  return {
    id: site._id.toHexString(),
    workspaceId: site.workspaceId.toHexString(),
    ...currentSitePresentation(site),
    subdomain: site.subdomain,
    defaultOrigin,
    privacyConfigured: sitePrivacyOf(site) !== null,
    confirmedLeadRecipients: confirmedRecipientsOf(site).length,
    createdAt: site.createdAt.toISOString(),
  };
}
