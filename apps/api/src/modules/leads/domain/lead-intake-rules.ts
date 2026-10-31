import { createHash } from 'node:crypto';
import {
  LEAD_SPAM_MIN_FILL_MS,
  type LeadDevice,
  type PublicLeadValues,
  type SpamReason,
} from '@plp/contracts';
import type { ObjectId } from '../../../shared/persistence/object-id.js';
import { addressKey } from '../../../shared/renderer-channel/address-key.js';
import { addressNetwork } from '../../../shared/visitor-address.js';

/** Phones and tablets count as "Điện thoại" on the analytics board; the rest as "Máy tính". */
export function deviceFromUserAgent(userAgent: string): LeadDevice {
  return /Mobi|Android|iPhone|iPad|iPod|Opera Mini|IEMobile/i.test(userAgent)
    ? 'mobile'
    : 'desktop';
}

/**
 * Why a lead looks automated (ADR-016): the hidden field was filled, or the form was sent faster
 * than a person can fill it. Without the page script the fill time is unknown and not judged.
 */
export function spamReasons(input: { honeypot: string; elapsedMs: number | null }): SpamReason[] {
  const reasons: SpamReason[] = [];
  if (input.honeypot.trim() !== '') {
    reasons.push('honeypot');
  }
  if (input.elapsedMs !== null && input.elapsedMs < LEAD_SPAM_MIN_FILL_MS) {
    reasons.push('too_fast');
  }
  return reasons;
}

/**
 * `date` plus whole calendar months in UTC, clamped to the last day of the target month (31
 * January + 1 month is 28 or 29 February), like MongoDB's `$dateAdd`.
 */
export function addMonthsUtc(date: Date, months: number): Date {
  const target = new Date(date.getTime());
  const day = target.getUTCDate();
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

/**
 * Rate-limit buckets (ADR-016). Addresses are keyed hashes (`addressKey`), so none can be read
 * back from the database; an IPv6 visitor counts by their /64 network (`addressNetwork`). Without a
 * trusted address every visitor of the site shares one bucket, the safe default when no proxy is
 * in front.
 */
export function clientLimitKey(secret: Buffer, siteId: ObjectId, ip: string | null): string {
  const visitor = ip === null ? 'unknown' : addressKey(secret, siteId, addressNetwork(ip));
  return `lead:ip:${siteId.toHexString()}:${visitor}`;
}

export function siteLimitKey(siteId: ObjectId): string {
  return `lead:site:${siteId.toHexString()}`;
}

/** What the visitor entered: the part of a submission that tells one lead from another. */
export type LeadEntries = Pick<
  PublicLeadValues,
  'name' | 'phone' | 'email' | 'message' | 'marketing'
>;

/**
 * The key a submission is stored and looked up under (ADR-016): the form's submission id together
 * with what the visitor entered, as the contract normalized it. The same entries under the same id
 * are a replay (a lost answer, a reloaded result page, the page script's retry); different entries
 * under the same id are a new lead, such as a visitor without script who went Back, corrected the
 * phone and sent the form again. The fill time grows with each retry of the script and is not
 * part of it. A hash: the submission id is random and never stored, so the key reveals nothing.
 */
export function submissionKey(submissionId: string, entries: LeadEntries): string {
  const { name, phone, email, message, marketing } = entries;
  return createHash('sha256')
    .update(JSON.stringify([submissionId, name, phone, email, message, marketing]))
    .digest('hex');
}
