import { describe, expect, it } from 'vitest';
import { apexOf, domainKind, normalizeHostname, relativeRecordName } from './domains.js';

describe('normalizeHostname', () => {
  it('makes a domain canonical: lower case, punycode, no trailing dot', () => {
    expect(normalizeHostname('  Go.SmileCare.vn. ')).toEqual({
      ok: true,
      hostname: 'go.smilecare.vn',
    });
    expect(normalizeHostname('nhàkhoa.vn')).toEqual({ ok: true, hostname: 'xn--nhkhoa-jta.vn' });
  });

  it('refuses a URL, a port or a path, suggesting the domain (board 14)', () => {
    expect(normalizeHostname('https://uudai.smilecare.vn/')).toEqual({
      ok: false,
      message: 'Chỉ nhập tên miền, không kèm https://, cổng và dấu / ở cuối.',
      suggestion: 'uudai.smilecare.vn',
    });
    expect(normalizeHostname('uudai.smilecare.vn:8080')).toMatchObject({
      ok: false,
      suggestion: 'uudai.smilecare.vn',
    });
    expect(normalizeHostname('uudai.smilecare.vn/khuyen-mai')).toMatchObject({ ok: false });
  });

  it('refuses names that are not a public domain', () => {
    for (const input of ['', 'localhost', 'smilecare', '10.0.0.1', 'a_b.vn', '-x.vn', 'x.123']) {
      expect(normalizeHostname(input).ok, input).toBe(false);
    }
    expect(normalizeHostname(`${'a'.repeat(64)}.vn`).ok).toBe(false);
  });

  it('refuses the system’s own addresses', () => {
    expect(normalizeHostname('smile.payload.site', 'payload.site').ok).toBe(false);
    expect(normalizeHostname('payload.site', 'payload.site:443').ok).toBe(false);
    expect(normalizeHostname('payload.site.vn', 'payload.site').ok).toBe(true);
  });
});

describe('domain kinds and record names', () => {
  it('tells a registrable domain from a name under one', () => {
    expect(domainKind('smilecare.vn')).toBe('apex');
    expect(domainKind('smilecare.com.vn')).toBe('apex');
    expect(domainKind('go.smilecare.vn')).toBe('subdomain');
    expect(domainKind('go.smilecare.com.vn')).toBe('subdomain');
    expect(apexOf('uudai.go.smilecare.com.vn')).toBe('smilecare.com.vn');
  });

  it('names records as providers ask for them', () => {
    expect(relativeRecordName('go.smilecare.vn', 'go.smilecare.vn')).toBe('go');
    expect(relativeRecordName('_payload.go.smilecare.vn', 'go.smilecare.vn')).toBe('_payload.go');
    expect(relativeRecordName('smilecare.vn', 'smilecare.vn')).toBe('@');
    expect(relativeRecordName('_payload.smilecare.vn', 'smilecare.vn')).toBe('_payload');
  });
});
