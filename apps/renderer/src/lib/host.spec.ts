import { describe, expect, it } from 'vitest';
import { requestHost, subdomainFromHeaders, subdomainFromHost } from './host';

describe('subdomainFromHost', () => {
  describe('with a port in BASE_DOMAIN (development)', () => {
    const base = 'localhost:3101';

    it('returns the single label in front of the base domain', () => {
      expect(subdomainFromHost('smilecare.localhost:3101', base)).toBe('smilecare');
    });

    it('requires the same port', () => {
      expect(subdomainFromHost('smilecare.localhost:3000', base)).toBeNull();
      expect(subdomainFromHost('smilecare.localhost', base)).toBeNull();
    });
  });

  describe('without a port in BASE_DOMAIN (production)', () => {
    const base = 'payload.site';

    it('returns the subdomain', () => {
      expect(subdomainFromHost('smilecare.payload.site', base)).toBe('smilecare');
      expect(subdomainFromHost('nha-khoa-2.payload.site', base)).toBe('nha-khoa-2');
    });

    it('accepts default ports and rejects other ports', () => {
      expect(subdomainFromHost('smilecare.payload.site:443', base)).toBe('smilecare');
      expect(subdomainFromHost('smilecare.payload.site:80', base)).toBe('smilecare');
      expect(subdomainFromHost('smilecare.payload.site:8080', base)).toBeNull();
    });

    it('lowercases the host', () => {
      expect(subdomainFromHost('SmileCare.PAYLOAD.site', base)).toBe('smilecare');
      expect(subdomainFromHost('smilecare.payload.site', 'Payload.Site')).toBe('smilecare');
    });

    it('rejects nested labels and the apex', () => {
      expect(subdomainFromHost('a.smilecare.payload.site', base)).toBeNull();
      expect(subdomainFromHost('payload.site', base)).toBeNull();
      expect(subdomainFromHost('.payload.site', base)).toBeNull();
    });

    it('rejects foreign hosts, including look-alikes', () => {
      expect(subdomainFromHost('smilecare.example.com', base)).toBeNull();
      expect(subdomainFromHost('smilecarepayload.site', base)).toBeNull();
      expect(subdomainFromHost('smilecare.payload.site.evil.com', base)).toBeNull();
      expect(subdomainFromHost('127.0.0.1', base)).toBeNull();
      expect(subdomainFromHost('[::1]:3101', base)).toBeNull();
    });

    it('rejects labels that are not valid or reserved subdomains', () => {
      expect(subdomainFromHost('ab.payload.site', base)).toBeNull();
      expect(subdomainFromHost('-smile.payload.site', base)).toBeNull();
      expect(subdomainFromHost('smile--care.payload.site', base)).toBeNull();
      expect(subdomainFromHost('smile_care.payload.site', base)).toBeNull();
      expect(subdomainFromHost('www.payload.site', base)).toBeNull();
      expect(subdomainFromHost(`${'a'.repeat(41)}.payload.site`, base)).toBeNull();
    });

    it('rejects a missing or malformed host', () => {
      expect(subdomainFromHost(null, base)).toBeNull();
      expect(subdomainFromHost('', base)).toBeNull();
      expect(subdomainFromHost('smilecare.payload.site/path', base)).toBeNull();
      expect(subdomainFromHost('user@smilecare.payload.site', base)).toBeNull();
    });
  });
});

describe('requestHost', () => {
  const headers = (values: Record<string, string>) => new Headers(values);

  it('ignores x-forwarded-host unless the proxy is trusted', () => {
    const source = headers({ host: 'renderer:3101', 'x-forwarded-host': 'smilecare.payload.site' });
    expect(requestHost(source, false)).toBe('renderer:3101');
    expect(requestHost(source, true)).toBe('smilecare.payload.site');
  });

  it('takes the first forwarded host and falls back to Host', () => {
    expect(
      requestHost(headers({ host: 'x', 'x-forwarded-host': 'a.payload.site, proxy.local' }), true),
    ).toBe('a.payload.site');
    expect(requestHost(headers({ host: 'b.payload.site' }), true)).toBe('b.payload.site');
  });
});

describe('subdomainFromHeaders', () => {
  it('combines the host lookup with the base domain', () => {
    const env = { BASE_DOMAIN: 'payload.site', TRUST_PROXY: false };
    expect(subdomainFromHeaders(new Headers({ host: 'smilecare.payload.site' }), env)).toBe(
      'smilecare',
    );
    expect(
      subdomainFromHeaders(
        new Headers({ host: 'attacker.example', 'x-forwarded-host': 'smilecare.payload.site' }),
        env,
      ),
    ).toBeNull();
  });
});
