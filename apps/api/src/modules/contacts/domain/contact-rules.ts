import { CONTACT_TAGS_MAX, foldVietnamese, type MergeContactsRequest } from '@plp/contracts';
import type { ObjectId } from '../../../shared/persistence/object-id.js';
import { addMonthsUtc } from '../../leads/domain/lead-intake-rules.js';
import { phoneSearchKey } from '../../leads/domain/lead-search.js';
import type { ContactMarketing, ContactRecord, ContactSearchKeys } from '../contact.schema.js';

/** Two leads on one page this many days apart, from people of the same name, make a pair. */
export const NAME_PAGE_WINDOW_DAYS = 7;
const DAY_MS = 86_400_000;

export function contactSearchKeys(fields: {
  name: string;
  phone: string | null;
  email: string | null;
}): ContactSearchKeys {
  return {
    phone: fields.phone === null ? null : phoneSearchKey(fields.phone),
    email: fields.email?.toLowerCase() ?? null,
    name: foldVietnamese(fields.name),
  };
}

/**
 * When a profile expires (ADR-033): its most recent interaction plus the site's retention, or
 * never. A lead is an interaction, so this is never before the expiry of the profile's last lead.
 */
export function contactExpiry(lastActivityAt: Date, months: number | null): Date | null {
  return months === null ? null : addMonthsUtc(lastActivityAt, months);
}

/** One suggestion per pair of profiles, whichever of them was seen first. */
export function pairOf(a: ObjectId, b: ObjectId): { ids: [ObjectId, ObjectId]; key: string } {
  const [low, high] = a.toHexString() < b.toHexString() ? [a, b] : [b, a];
  return { ids: [low, high], key: `${low.toHexString()}:${high.toHexString()}` };
}

/** A pair lasts no longer than the first of its profiles; null means neither expires. */
export function pairExpiry(a: Date | null, b: Date | null): Date | null {
  if (a === null) {
    return b;
  }
  if (b === null) {
    return a;
  }
  return a < b ? a : b;
}

/** Whole days between two leads, for "cùng đăng ký trang … trong 2 ngày". */
export function daysApart(a: Date, b: Date): number {
  return Math.floor(Math.abs(a.getTime() - b.getTime()) / DAY_MS);
}

/** The window of leads that pair with one sent at `at`. */
export function namePageWindow(at: Date): { from: Date; to: Date } {
  const span = NAME_PAGE_WINDOW_DAYS * DAY_MS;
  return { from: new Date(at.getTime() - span), to: new Date(at.getTime() + span) };
}

/** What the profile kept becomes, from the two profiles and the side picked for each field. */
export interface MergedContact {
  name: string;
  phone: string | null;
  email: string | null;
  search: ContactSearchKeys;
  ownerId: ObjectId | null;
  marketing: ContactMarketing;
  tags: string[];
  leadCount: number;
  lastLead: ContactRecord['lastLead'];
  lastActivityAt: Date;
}

type MergeInput = Pick<
  ContactRecord,
  | 'name'
  | 'phone'
  | 'email'
  | 'ownerId'
  | 'marketing'
  | 'tags'
  | 'leadCount'
  | 'lastLead'
  | 'lastActivityAt'
>;

/**
 * "Gộp hai hồ sơ" (ADR-033): each field from the side picked; tags of both (at most
 * `CONTACT_TAGS_MAX`, the kept profile's first), the leads of both, the latest interaction.
 */
export function mergeContacts(
  a: MergeInput,
  b: MergeInput,
  picks: MergeContactsRequest['picks'],
): MergedContact {
  const side = (field: keyof MergeContactsRequest['picks']) => (picks[field] === 'a' ? a : b);
  const name = side('name').name;
  const phone = side('phone').phone;
  const email = side('email').email;
  const lastLead =
    a.lastLead === null || (b.lastLead !== null && b.lastLead.at > a.lastLead.at)
      ? b.lastLead
      : a.lastLead;
  return {
    name,
    phone,
    email,
    search: contactSearchKeys({ name, phone, email }),
    ownerId: side('owner').ownerId,
    marketing: side('marketing').marketing,
    tags: [...new Set([...a.tags, ...b.tags])].slice(0, CONTACT_TAGS_MAX),
    leadCount: a.leadCount + b.leadCount,
    lastLead,
    lastActivityAt: a.lastActivityAt > b.lastActivityAt ? a.lastActivityAt : b.lastActivityAt,
  };
}
