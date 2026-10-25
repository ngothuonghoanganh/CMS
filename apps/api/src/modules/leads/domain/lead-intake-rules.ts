import { createHash } from 'node:crypto';
import { LEAD_SPAM_MIN_FILL_MS } from '@plp/contracts';
import type { ObjectId } from '../../../shared/persistence/object-id.js';

export type LeadDevice = 'mobile' | 'desktop';

/** Phones and tablets count as "Điện thoại" on the analytics board; the rest as "Máy tính". */
export function deviceFromUserAgent(userAgent: string): LeadDevice {
  return /Mobi|Android|iPhone|iPad|iPod|Opera Mini|IEMobile/i.test(userAgent)
    ? 'mobile'
    : 'desktop';
}

export type SpamReason = 'honeypot' | 'too_fast';

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
 * Rate-limit buckets (ADR-016). Addresses are hashed so none is stored. Without a trusted address
 * every visitor of the site shares one bucket, the safe default when no proxy is in front.
 */
export function clientLimitKey(siteId: ObjectId, ip: string | null): string {
  const visitor = ip === null ? 'unknown' : createHash('sha256').update(ip).digest('hex');
  return `lead:ip:${siteId.toHexString()}:${visitor}`;
}

export function siteLimitKey(siteId: ObjectId): string {
  return `lead:site:${siteId.toHexString()}`;
}
