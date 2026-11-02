import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  accountLink,
  hashLinkToken,
  newLinkToken,
  resetLinkExpiry,
  signupLinkExpiry,
} from './account-links.js';

describe('account links (ADR-026)', () => {
  it('makes a fresh 32-byte secret each time and keeps only its sha256', () => {
    const first = newLinkToken();
    const second = newLinkToken();
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.token).not.toBe(second.token);
    expect(first.tokenHash).toBe(createHash('sha256').update(first.token).digest('hex'));
    expect(hashLinkToken(first.token)).toBe(first.tokenHash);
  });

  it('keeps a sign-up link 24 hours and a reset link 60 minutes', () => {
    const now = new Date('2026-11-02T08:00:00.000Z');
    expect(signupLinkExpiry(now)).toEqual(new Date('2026-11-03T08:00:00.000Z'));
    expect(resetLinkExpiry(now)).toEqual(new Date('2026-11-02T09:00:00.000Z'));
  });

  it('puts the secret in the fragment', () => {
    expect(accountLink('https://app.example.vn', '/reset-password', 'abc')).toBe(
      'https://app.example.vn/reset-password#token=abc',
    );
  });
});
