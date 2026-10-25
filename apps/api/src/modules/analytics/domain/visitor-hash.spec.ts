import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { toObjectId } from '../../../shared/persistence/object-id.js';
import { addressKeySecret } from '../../../shared/renderer-channel/address-key.js';
import { visitorHash, visitorHashSecret } from './visitor-hash.js';

const SECRET = visitorHashSecret('renderer-api-secret-of-at-least-32-chars');
const SITE = toObjectId('64b0000000000000000000a1');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)';
const INPUT = { salt: 'muoi-ngay-25', siteId: SITE, ip: '203.0.113.7', userAgent: UA };

describe('visitorHash', () => {
  it('is the same for one visitor on one day, and holds neither the address nor the browser', () => {
    const hash = visitorHash(SECRET, INPUT);
    expect(visitorHash(SECRET, { ...INPUT })).toBe(hash);
    expect(hash).not.toContain('203.0.113.7');
    expect(hash).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('differs for another day, site, address or browser', () => {
    const hash = visitorHash(SECRET, INPUT);
    expect(visitorHash(SECRET, { ...INPUT, salt: 'muoi-ngay-26' })).not.toBe(hash);
    expect(
      visitorHash(SECRET, { ...INPUT, siteId: toObjectId('64b0000000000000000000a2') }),
    ).not.toBe(hash);
    expect(visitorHash(SECRET, { ...INPUT, ip: '203.0.113.8' })).not.toBe(hash);
    expect(visitorHash(SECRET, { ...INPUT, ip: null })).not.toBe(hash);
    expect(visitorHash(SECRET, { ...INPUT, userAgent: `${UA} Zalo` })).not.toBe(hash);
  });

  it('cannot be recomputed from what the database holds: the salt, the site and a guess', () => {
    const hash = visitorHash(SECRET, INPUT);
    const unkeyed = createHash('sha256')
      .update([INPUT.salt, SITE.toHexString(), INPUT.ip, UA].join('\n'))
      .digest('base64url');
    expect(hash).not.toBe(unkeyed);
    expect(
      visitorHash(visitorHashSecret('another-renderer-api-secret-32-chars!!'), INPUT),
    ).not.toBe(hash);
    // Its own key: not the one of the rate-limit buckets, nor the renderer secret itself.
    expect(SECRET.equals(addressKeySecret('renderer-api-secret-of-at-least-32-chars'))).toBe(false);
    expect(SECRET.equals(Buffer.from('renderer-api-secret-of-at-least-32-chars'))).toBe(false);
  });
});
