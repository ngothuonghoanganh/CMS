import { describe, expect, it } from 'vitest';
import { toObjectId } from '../../../shared/persistence/object-id.js';
import { addressKey, addressKeySecret } from '../../../shared/renderer-channel/address-key.js';
import { pageViewClientKey } from '../../analytics/domain/page-view-limits.js';
import { visitorHash, visitorHashSecret } from '../../analytics/domain/visitor-hash.js';
import { clientLimitKey } from './lead-intake-rules.js';
import { addressNetwork, canonicalAddress } from './visitor-address.js';

const RENDERER_SECRET = 'renderer-api-secret-of-at-least-32-chars';
const SITE = toObjectId('64b0000000000000000000a1');

describe('canonicalAddress', () => {
  it('keeps an IPv4 address as it is', () => {
    expect(canonicalAddress('203.0.113.7')).toBe('203.0.113.7');
  });

  it.each([
    ['::ffff:203.0.113.7', '203.0.113.7'],
    ['::FFFF:203.0.113.7', '203.0.113.7'],
    ['0:0:0:0:0:ffff:203.0.113.7', '203.0.113.7'],
    ['::ffff:cb00:7107', '203.0.113.7'],
    ['::ffff:0.0.0.0', '0.0.0.0'],
    ['::ffff:ffff:ffff', '255.255.255.255'],
  ])('reads the IPv4-mapped %j as %j', (mapped, ipv4) => {
    expect(canonicalAddress(mapped)).toBe(ipv4);
  });

  it.each([
    ['2001:db8::1', '2001:db8:0:0:0:0:0:1'],
    ['2001:DB8:0000:0000:0000:0000:0000:0001', '2001:db8:0:0:0:0:0:1'],
    ['2001:db8:85a3::8a2e:370:7334', '2001:db8:85a3:0:0:8a2e:370:7334'],
    ['2001:db8:85a3:0:0:8A2E:0370:7334', '2001:db8:85a3:0:0:8a2e:370:7334'],
    ['::1', '0:0:0:0:0:0:0:1'],
    ['::', '0:0:0:0:0:0:0:0'],
    ['fe80::1%eth0', 'fe80:0:0:0:0:0:0:1'],
    // Not mapped: NAT64 and "IPv4-compatible" forms stay IPv6.
    ['64:ff9b::203.0.113.7', '64:ff9b:0:0:0:0:cb00:7107'],
    ['::203.0.113.7', '0:0:0:0:0:0:cb00:7107'],
    ['::ffff:0:203.0.113.7', '0:0:0:0:ffff:0:cb00:7107'],
  ])('writes the IPv6 %j in one spelling, %j', (ip, canonical) => {
    expect(canonicalAddress(ip)).toBe(canonical);
  });

  it('refuses what is not an address, without repeating it', () => {
    expect(() => canonicalAddress('203.0.113.007')).toThrow(
      'A visitor address that is not an IP address reached the API',
    );
  });
});

describe('addressNetwork', () => {
  it('is the IPv4 address itself, mapped or not', () => {
    expect(addressNetwork('203.0.113.7')).toBe('203.0.113.7');
    expect(addressNetwork('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('is the /64 network of an IPv6 address', () => {
    expect(addressNetwork('2001:db8:85a3:1::1')).toBe('2001:db8:85a3:1::/64');
    expect(addressNetwork('2001:DB8:85A3:0001:FFFF:FFFF:FFFF:FFFE')).toBe('2001:db8:85a3:1::/64');
    expect(addressNetwork('2001:db8:85a3:2::1')).toBe('2001:db8:85a3:2::/64');
    expect(addressNetwork('::1')).toBe('0:0:0:0::/64');
  });
});

describe('visitor address keys', () => {
  const addressSecret = addressKeySecret(RENDERER_SECRET);

  it('counts the leads and views of one /64 in one bucket per site', () => {
    const network = addressKey(addressSecret, SITE, '2001:db8:85a3:1::/64');
    expect(clientLimitKey(addressSecret, SITE, '2001:db8:85a3:1::1')).toBe(
      `lead:ip:64b0000000000000000000a1:${network}`,
    );
    expect(clientLimitKey(addressSecret, SITE, '2001:db8:85a3:1:abcd::2')).toBe(
      `lead:ip:64b0000000000000000000a1:${network}`,
    );
    expect(pageViewClientKey(addressSecret, SITE, '2001:DB8:85A3:1::FFFF')).toBe(
      `view:ip:64b0000000000000000000a1:${network}`,
    );
    expect(clientLimitKey(addressSecret, SITE, '::ffff:203.0.113.7')).toBe(
      `lead:ip:64b0000000000000000000a1:${addressKey(addressSecret, SITE, '203.0.113.7')}`,
    );
  });

  it('tells two devices of one IPv6 network apart as visitors, but not two spellings', () => {
    const secret = visitorHashSecret(RENDERER_SECRET);
    const input = { salt: 'muoi-ngay-31', siteId: SITE, userAgent: 'Mozilla/5.0' };
    const hash = visitorHash(secret, { ...input, ip: '2001:db8:85a3:1::1' });
    expect(visitorHash(secret, { ...input, ip: '2001:DB8:85A3:1:0:0:0:0001' })).toBe(hash);
    expect(visitorHash(secret, { ...input, ip: '2001:db8:85a3:1::2' })).not.toBe(hash);
    expect(visitorHash(secret, { ...input, ip: '::ffff:203.0.113.7' })).toBe(
      visitorHash(secret, { ...input, ip: '203.0.113.7' }),
    );
  });
});
