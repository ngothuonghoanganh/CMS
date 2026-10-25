import type { SiteRecord } from '../sites/site.schema.js';
import type { SitePresentation } from './domain/site-presentation.js';
import type { ReleaseRecord } from './release.schema.js';

type PresentedSite = Pick<
  SiteRecord,
  'name' | 'themePresetId' | 'logoAssetId' | 'defaultShareImageAssetId'
>;

/**
 * The site's current settings, as a release snapshots them at publish (ADR-015). Draft previews
 * and the editor show these: they are what the next publish will freeze.
 */
export function currentSitePresentation(site: PresentedSite): SitePresentation {
  return {
    name: site.name,
    themePresetId: site.themePresetId,
    logoAssetId: site.logoAssetId?.toHexString() ?? null,
    defaultShareImageAssetId: site.defaultShareImageAssetId?.toHexString() ?? null,
  };
}

/**
 * The site settings a release is served with: its snapshot (ADR-015). A release published before
 * ADR-015 has none; such releases exist only in local development databases (MVP A has no
 * production data), and they read as the site's current settings, which is how they were served
 * before the snapshot existed. Only a missing field takes this path.
 */
export function releasePresentation(
  release: Pick<ReleaseRecord, 'sitePresentation'>,
  site: PresentedSite,
): SitePresentation {
  if (release.sitePresentation === undefined) {
    return currentSitePresentation(site);
  }
  return release.sitePresentation;
}
