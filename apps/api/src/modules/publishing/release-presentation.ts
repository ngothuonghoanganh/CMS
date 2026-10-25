import type { ConsentVersionRecord } from '../privacy/consent-version.schema.js';
import { type SiteRecord, sitePrivacyOf } from '../sites/site.schema.js';
import {
  currentLeadCapture,
  type LeadCapture,
  type LeadCaptureGap,
  leadCaptureGaps,
  type LeadCaptureSettings,
} from './domain/lead-capture.js';
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

/**
 * The lead capture the next publish of a page with a form would freeze (ADR-017): the site's
 * personal data settings and its latest consent version. Null while either is missing.
 */
export function currentSiteLeadCapture(
  site: Pick<SiteRecord, 'privacy'>,
  consent: ConsentVersionRecord | null,
): LeadCapture | null {
  return currentLeadCapture(leadCaptureSettingsOf(site, consent));
}

/** What a page with a form still misses before it can be published (ADR-016). */
export function siteLeadCaptureGaps(
  site: Pick<SiteRecord, 'privacy'>,
  consent: ConsentVersionRecord | null,
): LeadCaptureGap[] {
  return leadCaptureGaps(leadCaptureSettingsOf(site, consent));
}

function leadCaptureSettingsOf(
  site: Pick<SiteRecord, 'privacy'>,
  consent: ConsentVersionRecord | null,
): LeadCaptureSettings {
  return {
    privacy: sitePrivacyOf(site),
    consent: consent && {
      id: consent._id.toHexString(),
      version: consent.version,
      requiredText: consent.requiredText,
      marketingText: consent.marketingText,
    },
  };
}

/**
 * The consent settings a release's form is served with: its snapshot (ADR-017). Releases without a
 * form store null; releases published before ADR-017 lack the field, and none of them had a form.
 */
export function releaseLeadCapture(
  release: Pick<ReleaseRecord, 'leadCapture'>,
): LeadCapture | null {
  return release.leadCapture ?? null;
}
