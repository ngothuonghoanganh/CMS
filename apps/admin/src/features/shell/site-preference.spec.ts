import { describe, expect, it } from 'vitest';
import { siteFixture } from '../dashboard/test-fixtures';
import { pickSite, sitePreferenceCookie } from './site-preference';

const smile = siteFixture();
const spa = siteFixture({ id: '64b000000000000000000002', name: 'Spa Hoa Sen' });

describe('pickSite', () => {
  it('uses the site opened last while the user may still open it', () => {
    expect(pickSite([smile, spa], spa.id)).toBe(spa);
  });

  it('falls back to the first site, or none in a workspace without sites', () => {
    expect(pickSite([smile, spa], '64b0000000000000000000ff')).toBe(smile);
    expect(pickSite([smile, spa], undefined)).toBe(smile);
    expect(pickSite([], smile.id)).toBeNull();
  });
});

describe('sitePreferenceCookie', () => {
  it('stores a valid site id for the whole admin', () => {
    expect(sitePreferenceCookie(spa.id)).toBe(
      'plp_site=64b000000000000000000002; Path=/; Max-Age=31536000; SameSite=Lax',
    );
  });

  it('refuses anything that is not a site id', () => {
    expect(() => sitePreferenceCookie('x; Domain=evil.example')).toThrow();
  });
});
