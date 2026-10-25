import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { visitorHash } from './visitor-hash.js';

const SITE = new Types.ObjectId('64b0000000000000000000a1');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)';

describe('visitorHash', () => {
  it('is the same for one visitor on one day, and holds neither the address nor the browser', () => {
    const input = { salt: 'muoi-ngay-25', siteId: SITE, ip: '203.0.113.7', userAgent: UA };
    const hash = visitorHash(input);
    expect(visitorHash({ ...input })).toBe(hash);
    expect(hash).not.toContain('203.0.113.7');
    expect(hash).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('differs for another day, site, address or browser', () => {
    const input = { salt: 'muoi-ngay-25', siteId: SITE, ip: '203.0.113.7', userAgent: UA };
    const hash = visitorHash(input);
    expect(visitorHash({ ...input, salt: 'muoi-ngay-26' })).not.toBe(hash);
    expect(visitorHash({ ...input, siteId: new Types.ObjectId() })).not.toBe(hash);
    expect(visitorHash({ ...input, ip: '203.0.113.8' })).not.toBe(hash);
    expect(visitorHash({ ...input, ip: null })).not.toBe(hash);
    expect(visitorHash({ ...input, userAgent: `${UA} Zalo` })).not.toBe(hash);
  });
});
