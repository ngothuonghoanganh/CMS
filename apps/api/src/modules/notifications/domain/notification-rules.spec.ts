import { describe, expect, it } from 'vitest';
import {
  confirmationExpiry,
  nextAttemptDelay,
  NOTIFICATION_RETRY_DELAYS_MS,
  recipientStatus,
  smtpErrorCode,
} from './notification-rules.js';

describe('nextAttemptDelay', () => {
  it('waits 1 then 5 minutes, and gives up after the third attempt (ADR-018)', () => {
    expect(nextAttemptDelay(1, NOTIFICATION_RETRY_DELAYS_MS)).toBe(60_000);
    expect(nextAttemptDelay(2, NOTIFICATION_RETRY_DELAYS_MS)).toBe(300_000);
    expect(nextAttemptDelay(3, NOTIFICATION_RETRY_DELAYS_MS)).toBeNull();
    expect(nextAttemptDelay(4, NOTIFICATION_RETRY_DELAYS_MS)).toBeNull();
  });

  it('keeps the last wait when fewer waits than attempts are given', () => {
    expect(nextAttemptDelay(2, [10])).toBe(10);
  });
});

describe('smtpErrorCode', () => {
  it.each([
    [{ code: 'ETIMEDOUT' }, 'timeout'],
    [{ code: 'ECONNECTION' }, 'smtp_unavailable'],
    [{ code: 'ESOCKET', responseCode: undefined }, 'smtp_unavailable'],
    [{ code: 'ECONNREFUSED' }, 'smtp_unavailable'],
    [{ code: 'EENVELOPE', responseCode: 550 }, 'smtp_rejected'],
    [{ code: 'EMESSAGE', responseCode: 421 }, 'smtp_unavailable'],
    [{ code: 'EAUTH' }, 'smtp_rejected'],
    [{ code: 'EWHATEVER' }, 'unknown'],
    [new Error('boom'), 'unknown'],
    ['not an error', 'unknown'],
  ])('reads %j as %s', (error, code) => {
    expect(smtpErrorCode(error)).toBe(code);
  });
});

describe('recipients', () => {
  const now = new Date('2026-10-25T08:00:00.000Z');

  it('lets a confirmation link work for 7 days', () => {
    expect(confirmationExpiry(now)).toEqual(new Date('2026-11-01T08:00:00.000Z'));
  });

  it('tells confirmed, pending, expired and unsent addresses apart', () => {
    const later = new Date(now.getTime() + 1000);
    const earlier = new Date(now.getTime() - 1000);
    expect(recipientStatus({ confirmedAt: now, invitedAt: now, tokenExpiresAt: null }, now)).toBe(
      'confirmed',
    );
    expect(recipientStatus({ confirmedAt: null, invitedAt: now, tokenExpiresAt: later }, now)).toBe(
      'pending',
    );
    expect(
      recipientStatus({ confirmedAt: null, invitedAt: now, tokenExpiresAt: earlier }, now),
    ).toBe('expired');
    expect(
      recipientStatus({ confirmedAt: null, invitedAt: null, tokenExpiresAt: later }, now),
    ).toBe('unsent');
  });
});
