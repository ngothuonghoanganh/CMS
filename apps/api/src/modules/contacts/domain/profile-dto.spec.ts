import { describe, expect, it } from 'vitest';
import { toObjectId } from '../../../shared/persistence/object-id.js';
import type { LeadRecord } from '../../leads/lead.schema.js';
import { leadEntry, mergeTimeline, type ProfileNames } from './profile-dto.js';

const id = (n: number) => toObjectId(n.toString(16).padStart(24, '0'));
const T = Date.parse('2026-11-01T08:00:00.000Z');
const at = (minutes: number) => new Date(T + minutes * 60_000);

const NAMES: ProfileNames = {
  people: new Map(),
  pages: new Map([[id(90).toHexString(), 'Ưu đãi niềng răng']]),
  consentVersions: new Map([[id(91).toHexString(), 3]]),
};

function lead(createdAt: Date): LeadRecord {
  return {
    _id: id(50),
    createdAt,
    pageId: id(90),
    releaseId: id(91),
    fields: { name: 'Trang', phone: '+84912345678', email: null, message: 'Trả góp?' },
    source: { source: 'tiktok', medium: 'video', campaign: null },
  } as unknown as LeadRecord;
}

describe('profile timeline (board 23)', () => {
  it('merges both sources newest first, ties by id, and cursors after the last shown', () => {
    const events = [
      { at: at(5), id: id(3), record: 'note 5' },
      { at: at(2), id: id(1), record: 'note 2' },
    ];
    const leads = [
      { at: at(5), id: id(4), record: 'lead 5' },
      { at: at(1), id: id(2), record: 'lead 1' },
    ];
    const page = mergeTimeline(events, leads, 3);
    expect(page.items.map((entry) => entry.item.record)).toEqual(['lead 5', 'note 5', 'note 2']);
    expect(page.next).toEqual({ createdAt: at(2), id: id(1).toHexString() });
    expect(mergeTimeline(events, leads, 4).next).toBeNull();
  });

  it('reads a lead as a new lead, joined unless it created the profile', () => {
    const created = { origin: { kind: 'lead' as const }, createdAt: at(0) };
    expect(leadEntry(lead(at(0)), created, NAMES)).toMatchObject({
      kind: 'lead',
      page: { title: 'Ưu đãi niềng răng' },
      message: 'Trả góp?',
      source: 'tiktok',
      consentVersion: 3,
      joined: false,
    });
    expect(leadEntry(lead(at(9)), created, NAMES)).toMatchObject({ joined: true });
    const manual = {
      origin: { kind: 'manual' as const, channel: 'walk_in' as const, addedBy: id(7), at: at(0) },
      createdAt: at(0),
    };
    expect(leadEntry(lead(at(0)), manual, NAMES)).toMatchObject({ joined: true });
  });
});
