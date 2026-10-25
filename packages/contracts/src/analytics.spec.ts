import { describe, expect, it } from 'vitest';
import { analyticsQuerySchema, analyticsSourceLabel, pageViewSchema } from './analytics.js';

const NO_SOURCE = { utmSource: null, utmMedium: null, utmCampaign: null, referrer: null };

describe('pageViewSchema', () => {
  it('takes the path of a page and where the visitor came from', () => {
    const view = {
      path: '/uu-dai',
      source: { ...NO_SOURCE, utmSource: 'facebook', referrer: 'https://m.facebook.com/' },
    };
    expect(pageViewSchema.parse(view)).toEqual(view);
    expect(pageViewSchema.parse({ path: '/', source: NO_SOURCE }).path).toBe('/');
  });

  it('refuses a path that is not one, and oversized values', () => {
    expect(pageViewSchema.safeParse({ path: 'uu-dai', source: NO_SOURCE }).success).toBe(false);
    expect(
      pageViewSchema.safeParse({ path: `/${'a'.repeat(512)}`, source: NO_SOURCE }).success,
    ).toBe(false);
    expect(
      pageViewSchema.safeParse({ path: '/', source: { ...NO_SOURCE, utmSource: 'x'.repeat(501) } })
        .success,
    ).toBe(false);
  });
});

describe('analyticsQuerySchema', () => {
  it('shows the last 7 days of the whole site by default', () => {
    expect(analyticsQuerySchema.parse({})).toEqual({ range: '7d' });
    expect(
      analyticsQuerySchema.parse({ range: '90d', pageId: '64b0000000000000000000a1' }),
    ).toEqual({ range: '90d', pageId: '64b0000000000000000000a1' });
  });

  it('refuses another range and unknown parameters', () => {
    expect(analyticsQuerySchema.safeParse({ range: '365d' }).success).toBe(false);
    expect(analyticsQuerySchema.safeParse({ from: '2026-10-01' }).success).toBe(false);
  });
});

describe('analyticsSourceLabel', () => {
  it('names a source as the inbox does, and the pairs past the daily cap "khác"', () => {
    expect(analyticsSourceLabel({ source: 'facebook', medium: 'cpc' })).toBe('facebook / cpc');
    expect(analyticsSourceLabel({ source: '(direct)', medium: '(none)' })).toBe('trực tiếp');
    expect(analyticsSourceLabel({ source: '(other)', medium: '(other)' })).toBe('khác');
  });
});
