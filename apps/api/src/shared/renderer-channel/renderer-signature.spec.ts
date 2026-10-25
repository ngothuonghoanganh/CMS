import { describe, expect, it } from 'vitest';
import { signRendererRequest, verifyRendererSignature } from './renderer-signature.js';

// The renderer's spec checks the same vector, computed independently of both apps.
const SECRET = 'vector-secret-0123456789abcdef-0123456789';
const REQUEST = {
  timestamp: '1792900000',
  method: 'POST',
  path: '/public/sites/smilecare/leads',
  clientIp: '203.0.113.7',
  userAgent: 'Mozilla/5.0 (iPhone)',
  body: '{"name":"Hà"}',
};
const SIGNATURE = '4a46ea6db046b4ade3873cac7cea0ca94ef9ca1819567471952f7404ac2de4f8';
const NOW = 1_792_900_100;

describe('renderer request signature', () => {
  it('matches the shared test vector', () => {
    expect(signRendererRequest(SECRET, REQUEST)).toBe(SIGNATURE);
  });

  it('accepts a fresh, correctly signed request', () => {
    expect(verifyRendererSignature(SECRET, { ...REQUEST, signature: SIGNATURE }, NOW)).toEqual({
      ok: true,
    });
  });

  it.each([
    ['method', { method: 'PUT' }],
    ['path', { path: '/public/sites/smilecare/events' }],
    ['client address', { clientIp: '203.0.113.8' }],
    ['user agent', { userAgent: 'curl/8' }],
    ['body', { body: '{"name":"Hả"}' }],
  ])('refuses a request whose %s changed after signing', (_field, change) => {
    expect(
      verifyRendererSignature(SECRET, { ...REQUEST, ...change, signature: SIGNATURE }, NOW),
    ).toEqual({ ok: false, reason: 'invalid_signature' });
  });

  it('refuses missing headers, malformed and stale timestamps, and other secrets', () => {
    expect(verifyRendererSignature(SECRET, { ...REQUEST, signature: undefined }, NOW)).toEqual({
      ok: false,
      reason: 'missing_headers',
    });
    expect(
      verifyRendererSignature(
        SECRET,
        { ...REQUEST, timestamp: '1792900000.5', signature: SIGNATURE },
        NOW,
      ),
    ).toEqual({ ok: false, reason: 'invalid_timestamp' });
    expect(
      verifyRendererSignature(SECRET, { ...REQUEST, signature: SIGNATURE }, NOW + 301),
    ).toEqual({ ok: false, reason: 'stale_timestamp' });
    expect(
      verifyRendererSignature(`${SECRET}x`, { ...REQUEST, signature: SIGNATURE }, NOW),
    ).toEqual({ ok: false, reason: 'invalid_signature' });
    expect(verifyRendererSignature(SECRET, { ...REQUEST, signature: 'zz' }, NOW)).toEqual({
      ok: false,
      reason: 'invalid_signature',
    });
  });
});
