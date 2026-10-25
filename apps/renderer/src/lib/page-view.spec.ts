import { describe, expect, it } from 'vitest';
import { hasInternalFlag, pageViewOf, withoutInternalFlag } from './page-view';

describe('pageViewOf', () => {
  it('sends the path, the campaign tags and where the visitor came from', () => {
    expect(
      pageViewOf(
        { pathname: '/uu-dai', search: '?utm_source=facebook&utm_medium=cpc&utm_campaign=t11' },
        'https://m.facebook.com/',
      ),
    ).toEqual({
      path: '/uu-dai',
      source: {
        utmSource: 'facebook',
        utmMedium: 'cpc',
        utmCampaign: 't11',
        referrer: 'https://m.facebook.com/',
      },
    });
  });

  it('leaves out empty values and shortens oversized ones', () => {
    const view = pageViewOf(
      { pathname: '/', search: `?utm_source=&utm_medium=${'x'.repeat(600)}` },
      '',
    );
    expect(view.source).toEqual({
      utmSource: null,
      utmMedium: 'x'.repeat(500),
      utmCampaign: null,
      referrer: null,
    });
  });
});

describe('the flag of a member’s own visit', () => {
  it('is read from the address, then removed from it', () => {
    expect(hasInternalFlag('?plp_internal=1&utm_source=zalo')).toBe(true);
    expect(hasInternalFlag('?utm_source=zalo')).toBe(false);
    expect(
      withoutInternalFlag('https://smilecare.vn/uu-dai?plp_internal=1&utm_source=zalo#form'),
    ).toBe('/uu-dai?utm_source=zalo#form');
    expect(withoutInternalFlag('https://smilecare.vn/?plp_internal=1')).toBe('/');
  });
});
