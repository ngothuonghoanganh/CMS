import type { Site, SiteSummary } from '@plp/contracts';
import type { SitePageCounts } from '../pages/pages.repository.js';
import { currentSitePresentation } from '../publishing/release-presentation.js';
import { confirmedRecipientsOf, type SiteRecord, sitePrivacyOf } from './site.schema.js';

/**
 * Maps a stored site to the contract `Site`; `defaultOrigin` comes from the origin template and
 * `publicOrigin` from the primary domain (ADR-022). The
 * look (name, theme, logo, share image) is exactly what the next publish snapshots (ADR-015), so
 * the settings screen and the "site changed" reminders never disagree.
 */
export function toSiteDto(site: SiteRecord, defaultOrigin: string, publicOrigin: string): Site {
  return {
    id: site._id.toHexString(),
    workspaceId: site.workspaceId.toHexString(),
    ...currentSitePresentation(site),
    subdomain: site.subdomain,
    defaultOrigin,
    publicOrigin,
    privacyConfigured: sitePrivacyOf(site) !== null,
    confirmedLeadRecipients: confirmedRecipientsOf(site).length,
    createdAt: site.createdAt.toISOString(),
  };
}

/**
 * The counts of a site on the Sites screen (ADR-028), from counts made for every site at once: a
 * site without pages or recent leads is absent from them. `recentLeads` is null for roles that do
 * not see leads (ADR-024).
 */
export function toSiteSummary(
  siteId: string,
  pageCounts: ReadonlyMap<string, SitePageCounts>,
  recentLeads: ReadonlyMap<string, number> | null,
): SiteSummary {
  const pages = pageCounts.get(siteId);
  return {
    pages: pages?.pages ?? 0,
    livePages: pages?.livePages ?? 0,
    leadsLast7Days: recentLeads === null ? null : (recentLeads.get(siteId) ?? 0),
  };
}
