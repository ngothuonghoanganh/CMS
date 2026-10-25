import { createHash } from 'node:crypto';
import { DIRECT_LEAD_SOURCE } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import { toObjectId } from '../../../shared/persistence/object-id.js';
import { addressKey, addressKeySecret } from '../../../shared/renderer-channel/address-key.js';
import {
  addMonthsUtc,
  clientLimitKey,
  deviceFromUserAgent,
  siteLimitKey,
  spamReasons,
} from './lead-intake-rules.js';
import { isStandardSource, normalizeLeadSource } from './lead-source.js';

const NONE = { utmSource: null, utmMedium: null, utmCampaign: null, referrer: null };
const SITE_HOST = 'smilecare.payload.site';

describe('normalizeLeadSource', () => {
  it('turns line breaks and other control characters of a tag into one space', () => {
    expect(
      normalizeLeadSource({
        ...NONE,
        utmSource: 'Face\nbook',
        utmMedium: ' c\r\n\tp  c ',
        utmCampaign: '\u0000',
        siteHost: SITE_HOST,
      }),
    ).toEqual({ source: 'face book', medium: 'c p c', campaign: null });
  });

  it('never cuts an emoji in half at the 40th character', () => {
    const tag = `${'u'.repeat(39)}🔥 sale`;
    expect(
      normalizeLeadSource({ ...NONE, utmSource: tag, utmCampaign: tag, siteHost: SITE_HOST }),
    ).toEqual({ source: 'u'.repeat(39), medium: '(none)', campaign: 'u'.repeat(39) });
  });

  it('uses campaign tags first, lowercased and cut to 40 characters', () => {
    expect(
      normalizeLeadSource({
        ...NONE,
        utmSource: ' Facebook ',
        utmMedium: 'CPC',
        utmCampaign: `uu-dai-${'x'.repeat(60)}`,
        referrer: 'https://www.google.com/',
        siteHost: SITE_HOST,
      }),
    ).toEqual({ source: 'facebook', medium: 'cpc', campaign: `uu-dai-${'x'.repeat(33)}` });
    expect(normalizeLeadSource({ ...NONE, utmSource: 'zalo', siteHost: SITE_HOST })).toEqual({
      source: 'zalo',
      medium: '(none)',
      campaign: null,
    });
  });

  it('names search engines as organic and other sites as referrals', () => {
    const from = (referrer: string) =>
      normalizeLeadSource({ ...NONE, referrer, siteHost: SITE_HOST });
    expect(from('https://www.google.com.vn/search?q=nieng')).toEqual({
      source: 'google',
      medium: 'organic',
      campaign: null,
    });
    expect(from('https://coccoc.com/search')).toMatchObject({
      source: 'coccoc',
      medium: 'organic',
    });
    expect(from('https://l.facebook.com/l.php?u=x')).toMatchObject({
      source: 'facebook.com',
      medium: 'referral',
    });
  });

  it('treats no referrer, the site itself and junk as direct', () => {
    for (const referrer of [null, `https://${SITE_HOST}/uu-dai`, 'not a url', 'javascript:x']) {
      expect(normalizeLeadSource({ ...NONE, referrer, siteHost: `${SITE_HOST}:443` })).toEqual({
        ...DIRECT_LEAD_SOURCE,
        campaign: null,
      });
    }
  });
});

describe('lead intake rules', () => {
  it('splits user agents into phones and computers', () => {
    expect(deviceFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(
      'mobile',
    );
    expect(deviceFromUserAgent('Mozilla/5.0 (Linux; Android 15; SM-S921B) Mobile')).toBe('mobile');
    expect(deviceFromUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141')).toBe(
      'desktop',
    );
    expect(deviceFromUserAgent('')).toBe('desktop');
  });

  it('flags a filled honeypot and a form sent too fast', () => {
    expect(spamReasons({ honeypot: '', elapsedMs: 8000 })).toEqual([]);
    expect(spamReasons({ honeypot: 'https://spam.example', elapsedMs: 900 })).toEqual([
      'honeypot',
      'too_fast',
    ]);
    // Without the page script the fill time is unknown.
    expect(spamReasons({ honeypot: '', elapsedMs: null })).toEqual([]);
  });

  it('adds calendar months in UTC and clamps to the end of the month', () => {
    expect(addMonthsUtc(new Date('2026-01-31T10:00:00Z'), 1).toISOString()).toBe(
      '2026-02-28T10:00:00.000Z',
    );
    expect(addMonthsUtc(new Date('2026-10-25T03:00:00Z'), 12).toISOString()).toBe(
      '2027-10-25T03:00:00.000Z',
    );
    expect(addMonthsUtc(new Date('2027-08-31T00:00:00Z'), 6).toISOString()).toBe(
      '2028-02-29T00:00:00.000Z',
    );
  });

  it('keys visitor addresses into per-site buckets that the database cannot read back', () => {
    const siteId = toObjectId('64b0000000000000000000a1');
    const secret = addressKeySecret('renderer-api-secret-of-at-least-32-chars');
    const key = clientLimitKey(secret, siteId, '203.0.113.7');
    expect(key).toBe(
      `lead:ip:64b0000000000000000000a1:${addressKey(secret, siteId, '203.0.113.7')}`,
    );
    expect(key).not.toContain('203.0.113.7');
    expect(key).not.toContain(createHash('sha256').update('203.0.113.7').digest('hex'));
    expect(clientLimitKey(secret, siteId, null)).toBe('lead:ip:64b0000000000000000000a1:unknown');
    expect(siteLimitKey(siteId)).toBe('lead:site:64b0000000000000000000a1');
  });
});

describe('isStandardSource', () => {
  it('is direct visits and the organic visits of a search engine', () => {
    expect(isStandardSource(DIRECT_LEAD_SOURCE)).toBe(true);
    expect(isStandardSource({ source: 'google', medium: 'organic' })).toBe(true);
    expect(isStandardSource({ source: 'coccoc', medium: 'organic' })).toBe(true);
    expect(isStandardSource({ source: 'google', medium: 'cpc' })).toBe(false);
    expect(isStandardSource({ source: '(direct)', medium: 'cpc' })).toBe(false);
    expect(isStandardSource({ source: 'facebook', medium: 'organic' })).toBe(false);
  });
});
