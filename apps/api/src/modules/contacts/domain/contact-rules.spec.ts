import { describe, expect, it } from 'vitest';
import { toObjectId } from '../../../shared/persistence/object-id.js';
import {
  contactExpiry,
  contactSearchKeys,
  daysApart,
  mergeContacts,
  namePageWindow,
  pairExpiry,
  pairOf,
} from './contact-rules.js';

const A = toObjectId('64b0000000000000000000a1');
const B = toObjectId('64b0000000000000000000b2');
const OWNER = toObjectId('64b0000000000000000000c3');
const PAGE = toObjectId('64b0000000000000000000d4');

describe('contact rules (ADR-033)', () => {
  it('keys a profile for search like a lead, without a phone number when it has none', () => {
    expect(
      contactSearchKeys({ name: 'Nguyễn Thu Trang', phone: '+84912345678', email: 'T@Mail.vn' }),
    ).toEqual({ phone: '84912345678', email: 't@mail.vn', name: 'nguyen thu trang' });
    expect(contactSearchKeys({ name: 'Thu Trang', phone: null, email: null }).phone).toBeNull();
  });

  it('expires the retention after the last interaction, or never', () => {
    // Like a lead's expiry: the end of a shorter month, never the next one.
    expect(contactExpiry(new Date('2026-08-31T10:00:00Z'), 6)?.toISOString()).toBe(
      '2027-02-28T10:00:00.000Z',
    );
    expect(contactExpiry(new Date('2026-01-31T10:00:00Z'), null)).toBeNull();
  });

  it('keys a pair the same way from either side, and expires it with its first profile', () => {
    expect(pairOf(B, A)).toEqual(pairOf(A, B));
    expect(pairOf(A, B).ids).toEqual([A, B]);
    const early = new Date('2026-03-01T00:00:00Z');
    const late = new Date('2026-09-01T00:00:00Z');
    expect(pairExpiry(late, early)).toBe(early);
    expect(pairExpiry(null, late)).toBe(late);
    expect(pairExpiry(null, null)).toBeNull();
  });

  it('counts whole days between two leads and looks seven days around one', () => {
    expect(daysApart(new Date('2026-11-01T08:00:00Z'), new Date('2026-11-03T07:00:00Z'))).toBe(1);
    const window = namePageWindow(new Date('2026-11-08T00:00:00Z'));
    expect(window.from.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(window.to.toISOString()).toBe('2026-11-15T00:00:00.000Z');
  });

  it('merges each field from the side picked, and both sides’ tags, leads and latest activity', () => {
    const older = {
      name: 'Nguyễn Thu Trang',
      phone: '+84912345678',
      email: null,
      ownerId: OWNER,
      marketing: { consented: false, at: null, recordedBy: null },
      tags: ['Niềng răng', 'Trả góp'],
      leadCount: 2,
      lastLead: { pageId: PAGE, source: 'facebook', medium: 'cpc', at: new Date('2026-11-01') },
      lastActivityAt: new Date('2026-11-01'),
    };
    const newer = {
      name: 'Thu Trang',
      phone: null,
      email: 'trang.nt@gmail.com',
      ownerId: null,
      marketing: { consented: true, at: new Date('2026-10-30'), recordedBy: null },
      tags: ['Niềng răng', 'VIP'],
      leadCount: 1,
      lastLead: { pageId: PAGE, source: 'tiktok', medium: 'video', at: new Date('2026-11-03') },
      lastActivityAt: new Date('2026-11-03'),
    };
    const merged = mergeContacts(older, newer, {
      name: 'a',
      phone: 'a',
      email: 'b',
      owner: 'a',
      marketing: 'b',
    });
    expect(merged).toMatchObject({
      name: 'Nguyễn Thu Trang',
      phone: '+84912345678',
      email: 'trang.nt@gmail.com',
      ownerId: OWNER,
      marketing: newer.marketing,
      tags: ['Niềng răng', 'Trả góp', 'VIP'],
      leadCount: 3,
      lastLead: newer.lastLead,
      lastActivityAt: newer.lastActivityAt,
    });
    expect(merged.search).toEqual({
      phone: '84912345678',
      email: 'trang.nt@gmail.com',
      name: 'nguyen thu trang',
    });
  });

  it('keeps at most twenty tags after a merge, the kept profile’s first', () => {
    const tags = (prefix: string) => Array.from({ length: 15 }, (_, i) => `${prefix}${i}`);
    const base = {
      name: 'A',
      phone: null,
      email: null,
      ownerId: null,
      marketing: { consented: false, at: null, recordedBy: null },
      leadCount: 0,
      lastLead: null,
      lastActivityAt: new Date('2026-11-01'),
    };
    const merged = mergeContacts(
      { ...base, tags: tags('a') },
      { ...base, tags: tags('b') },
      {
        name: 'a',
        phone: 'a',
        email: 'a',
        owner: 'a',
        marketing: 'a',
      },
    );
    expect(merged.tags).toHaveLength(20);
    expect(merged.tags.slice(0, 15)).toEqual(tags('a'));
  });
});
