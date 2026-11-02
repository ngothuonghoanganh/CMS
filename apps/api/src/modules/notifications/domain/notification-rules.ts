import { createHash } from 'node:crypto';
import {
  LEAD_NOTIFICATION_MAX_ATTEMPTS,
  type LeadRecipientStatus,
  RECIPIENT_CONFIRMATION_DAYS,
} from '@plp/contracts';
import type { EmailErrorCode } from '../email-sender.js';

/** Waits after a failed attempt before the next one: attempt 1 → 1 minute, 2 → 5 minutes. */
export const NOTIFICATION_RETRY_DELAYS_MS: readonly number[] = [60_000, 300_000];

/** A `sending` notification untouched this long had its sender stop (the startup sweep). */
export const STALE_SENDING_MS = 10 * 60_000;

/** The startup sweep takes at most this many notifications, oldest first. */
export const NOTIFICATION_SWEEP_LIMIT = 500;

/** After `attempts` failed attempts: wait this long before the next one, or null to give up. */
export function nextAttemptDelay(attempts: number, delays: readonly number[]): number | null {
  if (attempts >= LEAD_NOTIFICATION_MAX_ATTEMPTS) {
    return null;
  }
  return delays[attempts - 1] ?? delays.at(-1) ?? 0;
}

/** Network and TLS failures: the server could not be reached or the connection broke. */
const UNREACHABLE = new Set([
  'ECONNECTION',
  'ESOCKET',
  'EDNS',
  'ETLS',
  'EPROXY',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ENETUNREACH',
]);

/** The server answered and refused: bad sender or recipients, authentication, the message. */
const REFUSED = new Set(['EENVELOPE', 'EAUTH', 'ENOAUTH', 'EMESSAGE', 'EREQUIRETLS']);

/**
 * The code of an SMTP failure from what nodemailer reports: its `code` and the server's reply.
 * A permanent reply (5xx) is a refusal; a temporary one (4xx) means try later.
 */
export function smtpErrorCode(error: unknown): EmailErrorCode {
  const code =
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : null;
  const responseCode =
    typeof error === 'object' &&
    error !== null &&
    'responseCode' in error &&
    typeof error.responseCode === 'number'
      ? error.responseCode
      : null;
  if (code === 'ETIMEDOUT') {
    return 'timeout';
  }
  if (responseCode !== null) {
    return responseCode >= 500 ? 'smtp_rejected' : 'smtp_unavailable';
  }
  if (code !== null && UNREACHABLE.has(code)) {
    return 'smtp_unavailable';
  }
  if (code !== null && REFUSED.has(code)) {
    return 'smtp_rejected';
  }
  return 'unknown';
}

/**
 * The code of a failed SendMessage from what the AWS SDK reports (ADR-029): its own timeouts, a
 * Node network error, or the queue's answer. Throttling and 5xx mean try later; any other answer
 * is a refusal, e.g. a role without `MailProducerPolicy` or a queue that does not exist.
 */
export function sqsErrorCode(error: unknown): EmailErrorCode {
  if (typeof error !== 'object' || error === null) {
    return 'unknown';
  }
  const name = 'name' in error && typeof error.name === 'string' ? error.name : null;
  const code = 'code' in error && typeof error.code === 'string' ? error.code : null;
  const status =
    '$metadata' in error &&
    typeof error.$metadata === 'object' &&
    error.$metadata !== null &&
    'httpStatusCode' in error.$metadata &&
    typeof error.$metadata.httpStatusCode === 'number'
      ? error.$metadata.httpStatusCode
      : null;
  const throttling =
    '$retryable' in error &&
    typeof error.$retryable === 'object' &&
    error.$retryable !== null &&
    'throttling' in error.$retryable &&
    error.$retryable.throttling === true;
  if (name === 'TimeoutError' || code === 'ETIMEDOUT') {
    return 'timeout';
  }
  if (status !== null) {
    return throttling || status === 429 || status >= 500 ? 'smtp_unavailable' : 'smtp_rejected';
  }
  if (code !== null && UNREACHABLE.has(code)) {
    return 'smtp_unavailable';
  }
  return 'unknown';
}

/** When a new confirmation link stops working. */
export function confirmationExpiry(now: Date): Date {
  return new Date(now.getTime() + RECIPIENT_CONFIRMATION_DAYS * 86_400_000);
}

/** Where an address stands (ADR-018), from what is stored about it. */
export function recipientStatus(
  recipient: { confirmedAt: Date | null; invitedAt: Date | null; tokenExpiresAt: Date | null },
  now: Date,
): LeadRecipientStatus {
  if (recipient.confirmedAt !== null) {
    return 'confirmed';
  }
  if (recipient.invitedAt === null) {
    return 'unsent';
  }
  return recipient.tokenExpiresAt !== null && recipient.tokenExpiresAt > now
    ? 'pending'
    : 'expired';
}

/**
 * Confirmation emails go to addresses that never agreed to anything, with a site name an owner
 * chose: they are capped per day so the feature cannot be used to flood or phish someone
 * (ADR-018). One site re-sending to one address is held tightly; an agency adding its own address
 * to many client sites stays well under the cap across sites.
 */
export const INVITE_LIMITS_PER_DAY = { siteAddress: 5, address: 30, workspace: 50 } as const;

export type InviteLimit = keyof typeof INVITE_LIMITS_PER_DAY;

/**
 * A limit key as it may be logged: without the hash of the address. The hash is a pseudonym of
 * personal data, and logs never carry personal data (AGENTS.md); the limit and the site or
 * workspace are enough to find the counter.
 */
export function loggableLimitKey(key: string): string {
  return key.replace(/:[0-9a-f]{64}$/, '');
}

/** Rate-limit keys of a confirmation email; the address is hashed so none is stored. */
export function inviteLimitKeys(
  email: string,
  ids: { workspaceId: { toHexString(): string }; siteId: { toHexString(): string } },
): Record<InviteLimit, string> {
  const address = createHash('sha256').update(email.toLowerCase()).digest('hex');
  return {
    siteAddress: `recipient-invite:site:${ids.siteId.toHexString()}:${address}`,
    address: `recipient-invite:address:${address}`,
    workspace: `recipient-invite:workspace:${ids.workspaceId.toHexString()}`,
  };
}
