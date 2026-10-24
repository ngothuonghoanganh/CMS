import { createHmac } from 'node:crypto';
import { REVALIDATE_MAX_SKEW_SECONDS } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import { signRevalidateRequest, verifyRevalidateSignature } from './revalidate-signature';

const SECRET = 'local-dev-revalidate-secret-change-me-0001';
const NOW = 1_793_000_000;
const BODY = JSON.stringify({ tags: ['site:smilecare'] });

function signed(overrides: { secret?: string; timestamp?: string; body?: string } = {}) {
  const timestamp = overrides.timestamp ?? String(NOW);
  return {
    timestamp,
    signature: signRevalidateRequest(overrides.secret ?? SECRET, timestamp, overrides.body ?? BODY),
  };
}

describe('signRevalidateRequest', () => {
  it('is the hex HMAC-SHA256 of "timestamp.body"', () => {
    const expected = createHmac('sha256', SECRET).update(`${NOW}.${BODY}`).digest('hex');
    expect(signRevalidateRequest(SECRET, String(NOW), BODY)).toBe(expected);
  });
});

describe('verifyRevalidateSignature', () => {
  const verify = (
    headers: { timestamp: string | null; signature: string | null },
    rawBody = BODY,
    nowSeconds = NOW,
  ) => verifyRevalidateSignature({ secret: SECRET, rawBody, nowSeconds, ...headers });

  it('accepts a valid signature', () => {
    expect(verify(signed())).toEqual({ ok: true });
  });

  it('accepts timestamps at the edge of the window, before or after now', () => {
    expect(verify(signed(), BODY, NOW + REVALIDATE_MAX_SKEW_SECONDS)).toEqual({ ok: true });
    expect(verify(signed(), BODY, NOW - REVALIDATE_MAX_SKEW_SECONDS)).toEqual({ ok: true });
  });

  it('rejects a signature made with another secret', () => {
    expect(verify(signed({ secret: 'another-secret-that-is-long-enough-000' }))).toEqual({
      ok: false,
      reason: 'invalid_signature',
    });
  });

  it('rejects a tampered body', () => {
    expect(verify(signed(), JSON.stringify({ tags: ['site:other'] }))).toEqual({
      ok: false,
      reason: 'invalid_signature',
    });
  });

  it('rejects an old or far-future timestamp, even when correctly signed', () => {
    expect(verify(signed(), BODY, NOW + REVALIDATE_MAX_SKEW_SECONDS + 1)).toEqual({
      ok: false,
      reason: 'stale_timestamp',
    });
    expect(verify(signed(), BODY, NOW - REVALIDATE_MAX_SKEW_SECONDS - 1)).toEqual({
      ok: false,
      reason: 'stale_timestamp',
    });
  });

  it('rejects a signature computed for a different timestamp', () => {
    const { signature } = signed({ timestamp: String(NOW - 10) });
    expect(verify({ timestamp: String(NOW), signature })).toEqual({
      ok: false,
      reason: 'invalid_signature',
    });
  });

  it('rejects missing or malformed headers', () => {
    expect(verify({ timestamp: null, signature: signed().signature })).toEqual({
      ok: false,
      reason: 'missing_headers',
    });
    expect(verify({ timestamp: String(NOW), signature: null })).toEqual({
      ok: false,
      reason: 'missing_headers',
    });
    expect(verify({ timestamp: '17e8', signature: signed().signature })).toEqual({
      ok: false,
      reason: 'invalid_timestamp',
    });
    expect(verify({ timestamp: String(NOW), signature: 'abc' })).toEqual({
      ok: false,
      reason: 'invalid_signature',
    });
    expect(verify({ timestamp: String(NOW), signature: 'z'.repeat(64) })).toEqual({
      ok: false,
      reason: 'invalid_signature',
    });
  });
});
