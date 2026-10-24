import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signRevalidation } from './revalidation-signature.js';

describe('signRevalidation', () => {
  const secret = 'test-revalidate-secret-0123456789abcdef';
  const body = '{"tags":["site:smilecare"]}';

  it('is the hex HMAC-SHA256 of "timestamp.body"', () => {
    const expected = createHmac('sha256', secret).update(`1700000000.${body}`).digest('hex');
    expect(signRevalidation(secret, '1700000000', body)).toBe(expected);
    expect(signRevalidation(secret, '1700000000', body)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes with the secret, the timestamp and the body', () => {
    const base = signRevalidation(secret, '1700000000', body);
    expect(signRevalidation(`${secret}x`, '1700000000', body)).not.toBe(base);
    expect(signRevalidation(secret, '1700000001', body)).not.toBe(base);
    expect(signRevalidation(secret, '1700000000', `${body} `)).not.toBe(base);
  });
});
