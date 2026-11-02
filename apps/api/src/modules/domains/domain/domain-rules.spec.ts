import { describe, expect, it } from 'vitest';
import { newObjectId } from '../../../shared/persistence/object-id.js';
import { EMPTY_CHECK } from '../domain.schema.js';
import {
  domainStatus,
  evaluateDns,
  expectedRecords,
  HTTPS_GRACE_MS,
  livePagesSummary,
  newDomainToken,
  nextCheckAt,
  servesPages,
  siteAddressStatus,
} from './domain-rules.js';

const targets = { cnameTarget: 'cname.payload.site', ipv4: ['203.0.113.10', '203.0.113.11'] };
const TOKEN = '8f3a2c91e07b4d5aa1b2c3d4e5f60718';
const NOW = new Date('2026-11-01T03:00:00.000Z');
const MINUTE = 60_000;

function at(minutes: number): Date {
  return new Date(NOW.getTime() + minutes * MINUTE);
}

describe('the records of a domain (board 14)', () => {
  it('asks a CNAME for a name under a domain, A records for the domain itself, and the TXT', () => {
    expect(
      expectedRecords(
        { hostname: 'uudai.smilecare.vn', token: TOKEN, check: EMPTY_CHECK },
        targets,
      ),
    ).toEqual([
      { type: 'CNAME', name: 'uudai.smilecare.vn', value: 'cname.payload.site', state: 'missing' },
      {
        type: 'TXT',
        name: '_payload.uudai.smilecare.vn',
        value: `payload-verify=${TOKEN}`,
        state: 'missing',
      },
    ]);
    expect(
      expectedRecords({ hostname: 'smilecare.com.vn', token: TOKEN, check: EMPTY_CHECK }, targets)
        .filter((record) => record.type === 'A')
        .map((record) => record.value),
    ).toEqual(['203.0.113.10', '203.0.113.11']);
  });

  it('makes a fresh token for every domain', () => {
    expect(newDomainToken()).toMatch(/^[0-9a-f]{32}$/);
    expect(newDomainToken()).not.toBe(newDomainToken());
  });
});

describe('evaluateDns', () => {
  const none = { cname: [], a: [], txt: [] };

  it('sees nothing yet', () => {
    expect(evaluateDns(TOKEN, none, targets)).toEqual({
      txt: 'missing',
      routing: 'missing',
      found: [],
    });
  });

  it('accepts a CNAME to the target, or A records that are all the edge’s', () => {
    expect(evaluateDns(TOKEN, { ...none, cname: ['CNAME.payload.site.'] }, targets).routing).toBe(
      'ok',
    );
    expect(evaluateDns(TOKEN, { ...none, a: ['203.0.113.11'] }, targets).routing).toBe('ok');
    expect(
      evaluateDns(TOKEN, { ...none, a: ['203.0.113.10', '45.119.84.10'] }, targets).routing,
    ).toBe('wrong');
  });

  it('shows what is there instead, for "Đang có"', () => {
    expect(evaluateDns(TOKEN, { ...none, a: ['103.97.125.18'] }, targets)).toMatchObject({
      routing: 'wrong',
      found: [{ type: 'A', value: '103.97.125.18' }],
    });
  });

  it('proves ownership only with the record’s own token', () => {
    expect(evaluateDns(TOKEN, { ...none, txt: [`payload-verify=${TOKEN}`] }, targets).txt).toBe(
      'ok',
    );
    expect(evaluateDns(TOKEN, { ...none, txt: ['payload-verify=someone-else'] }, targets).txt).toBe(
      'wrong',
    );
    expect(evaluateDns(TOKEN, { ...none, txt: ['v=spf1 -all'] }, targets).txt).toBe('missing');
  });
});

describe('domainStatus (board 13)', () => {
  const pending = { verifiedAt: null, check: EMPTY_CHECK, activeSince: null };
  const ok = { ...EMPTY_CHECK, at: NOW, txt: 'ok' as const, routing: 'ok' as const };

  it('waits for DNS, or says the records are wrong, or that another site has the domain', () => {
    expect(domainStatus(pending, false, NOW)).toBe('pending_dns');
    expect(
      domainStatus({ ...pending, check: { ...EMPTY_CHECK, routing: 'wrong' } }, false, NOW),
    ).toBe('misconfigured');
    expect(domainStatus(pending, true, NOW)).toBe('taken');
  });

  it('is active once verified and pointing here with HTTPS, or unchecked HTTPS', () => {
    expect(
      domainStatus(
        { verifiedAt: NOW, check: { ...ok, https: 'ok' }, activeSince: null },
        false,
        NOW,
      ),
    ).toBe('active');
    expect(
      domainStatus(
        { verifiedAt: NOW, check: { ...ok, https: 'unchecked' }, activeSince: null },
        false,
        NOW,
      ),
    ).toBe('active');
  });

  it('waits for the certificate for an hour, then needs attention', () => {
    const failing = { ...ok, https: 'failed' as const, httpsFailingSince: NOW };
    expect(
      domainStatus({ verifiedAt: NOW, check: failing, activeSince: null }, false, at(30)),
    ).toBe('issuing');
    expect(
      domainStatus(
        { verifiedAt: NOW, check: failing, activeSince: null },
        false,
        new Date(NOW.getTime() + HTTPS_GRACE_MS + MINUTE),
      ),
    ).toBe('needs_attention');
  });

  it('is lost when an active domain stops pointing here', () => {
    expect(
      domainStatus(
        { verifiedAt: NOW, check: { ...ok, routing: 'wrong' }, activeSince: NOW },
        false,
        NOW,
      ),
    ).toBe('lost');
  });

  it('serves pages once verified and pointing here', () => {
    expect(servesPages({ verifiedAt: NOW, check: ok })).toBe(true);
    expect(servesPages({ verifiedAt: null, check: ok })).toBe(false);
  });
});

describe('nextCheckAt', () => {
  it('checks a verified domain every 10 minutes', () => {
    expect(nextCheckAt({ verifiedAt: NOW, watchSince: NOW }, NOW)).toEqual(at(10));
  });

  it('checks a new domain every minute for an hour, every 10 then, and stops after 7 days', () => {
    expect(nextCheckAt({ verifiedAt: null, watchSince: NOW }, at(59))).toEqual(at(60));
    expect(nextCheckAt({ verifiedAt: null, watchSince: NOW }, at(61))).toEqual(at(71));
    expect(nextCheckAt({ verifiedAt: null, watchSince: NOW }, at(7 * 24 * 60))).toBeNull();
  });
});

describe('siteAddressStatus (board 01)', () => {
  const ok = {
    ...EMPTY_CHECK,
    at: NOW,
    txt: 'ok' as const,
    routing: 'ok' as const,
    https: 'ok' as const,
  };
  const active = { _id: newObjectId(), verifiedAt: NOW, check: ok, activeSince: NOW };
  const lost = {
    _id: newObjectId(),
    verifiedAt: NOW,
    check: { ...ok, routing: 'wrong' as const },
    activeSince: NOW,
  };
  const waiting = { _id: newObjectId(), verifiedAt: null, check: EMPTY_CHECK, activeSince: null };

  it('has no primary status while the default address is primary', () => {
    expect(siteAddressStatus([], null, NOW)).toEqual({
      primaryStatus: null,
      customDomainActive: false,
    });
    expect(siteAddressStatus([waiting, active], null, NOW)).toEqual({
      primaryStatus: null,
      customDomainActive: true,
    });
  });

  it('tells where the primary custom domain stands, and whether any domain is active', () => {
    expect(siteAddressStatus([active, waiting], active._id, NOW)).toEqual({
      primaryStatus: 'active',
      customDomainActive: true,
    });
    expect(siteAddressStatus([lost, waiting], lost._id, NOW)).toEqual({
      primaryStatus: 'lost',
      customDomainActive: false,
    });
  });
});

describe('livePagesSummary', () => {
  it('counts the live pages and picks a page other than the home page as the example', () => {
    expect(livePagesSummary(['', 'uu-dai-nieng-rang', 'cay-ghep-implant'])).toEqual({
      count: 3,
      exampleSlug: 'cay-ghep-implant',
    });
    expect(livePagesSummary([''])).toEqual({ count: 1, exampleSlug: '' });
    expect(livePagesSummary([])).toEqual({ count: 0, exampleSlug: null });
  });
});
