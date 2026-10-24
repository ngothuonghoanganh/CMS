import { publicSeoSchema } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import {
  cleanSeo,
  composition,
  heroSection,
  sampleSection,
} from '../../../../test/compositions.js';
import { firstHeroHeading, resolveSeo } from './resolve-seo.js';
import type { PageSnapshot } from './snapshot.js';

const ORIGIN = 'https://smilecare.payload.site';
const SITE = { name: 'Nha khoa Smile Care', defaultShareImageAssetId: null };
const SHARE = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const DEFAULT_SHARE = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const IMAGES = {
  [SHARE]: { url: 'https://cdn.example.com/share.png', width: 1200, height: 630 },
  [DEFAULT_SHARE]: { url: 'https://cdn.example.com/default.png', width: 1200, height: 630 },
};

function snapshot(overrides: Partial<PageSnapshot> = {}): PageSnapshot {
  return {
    slug: 'uu-dai',
    composition: composition([sampleSection('navbar'), heroSection({ heading: 'Niềng răng 0%' })]),
    seo: cleanSeo(),
    ...overrides,
  };
}

describe('resolveSeo', () => {
  it('uses the SEO settings of the snapshot', () => {
    const seo = resolveSeo(
      snapshot({ seo: cleanSeo({ title: ' Ưu đãi ', shareImageAssetId: SHARE, noindex: true }) }),
      SITE,
      ORIGIN,
      IMAGES,
    );
    expect(publicSeoSchema.parse(seo)).toEqual({
      title: 'Ưu đãi',
      description: cleanSeo().description,
      shareImage: IMAGES[SHARE],
      noindex: true,
      canonicalUrl: 'https://smilecare.payload.site/uu-dai',
    });
  });

  it('falls back to the first Hero heading, then to the site name', () => {
    expect(resolveSeo(snapshot({ seo: cleanSeo({ title: '' }) }), SITE, ORIGIN, {}).title).toBe(
      'Niềng răng 0%',
    );
    const noHeading = snapshot({
      seo: cleanSeo({ title: '' }),
      composition: composition([heroSection({ heading: '' })]),
    });
    expect(resolveSeo(noHeading, SITE, ORIGIN, {}).title).toBe('Nha khoa Smile Care');
  });

  it('skips an empty Hero heading for the next Hero', () => {
    expect(
      firstHeroHeading(
        composition([heroSection({ heading: ' ' }), heroSection({ heading: 'Thứ hai' })]),
      ),
    ).toBe('Thứ hai');
  });

  it('falls back to the site default share image, and to none when it is not available', () => {
    const site = { ...SITE, defaultShareImageAssetId: DEFAULT_SHARE };
    expect(resolveSeo(snapshot(), site, ORIGIN, IMAGES).shareImage).toEqual(IMAGES[DEFAULT_SHARE]);
    expect(resolveSeo(snapshot(), site, ORIGIN, {}).shareImage).toBeNull();
    expect(resolveSeo(snapshot(), SITE, ORIGIN, IMAGES).shareImage).toBeNull();
  });

  it('builds the canonical URL of the home page', () => {
    expect(resolveSeo(snapshot({ slug: '' }), SITE, ORIGIN, {}).canonicalUrl).toBe(
      'https://smilecare.payload.site/',
    );
  });
});
