import { describe, expect, it } from 'vitest';
import { newObjectId } from '../../shared/persistence/object-id.js';
import type { SitePresentation } from './domain/site-presentation.js';
import { currentSitePresentation, releasePresentation } from './release-presentation.js';

const logoId = newObjectId();
const site = {
  name: 'Nha khoa Smile Care',
  themePresetId: 'sunset' as const,
  logoAssetId: logoId,
  defaultShareImageAssetId: null,
};

const snapshot: SitePresentation = {
  name: 'Smile Care cũ',
  themePresetId: 'mint',
  logoAssetId: null,
  defaultShareImageAssetId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
};

describe('currentSitePresentation', () => {
  it('copies the site settings with asset ids as strings', () => {
    expect(currentSitePresentation(site)).toEqual({
      name: 'Nha khoa Smile Care',
      themePresetId: 'sunset',
      logoAssetId: logoId.toHexString(),
      defaultShareImageAssetId: null,
    });
  });
});

describe('releasePresentation', () => {
  it("uses the release's snapshot, whatever the site holds now", () => {
    expect(releasePresentation({ sitePresentation: snapshot }, site)).toEqual(snapshot);
  });

  it('reads a release published before ADR-015 (no snapshot) as the current site', () => {
    expect(releasePresentation({}, site)).toEqual(currentSitePresentation(site));
  });
});
