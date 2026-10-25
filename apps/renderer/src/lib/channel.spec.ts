import { describe, expect, it } from 'vitest';
import { clientAddress } from './client-address';
import { signRendererRequest } from './renderer-signature';

function headers(values: Record<string, string>) {
  return new Headers(values);
}

describe('signRendererRequest', () => {
  it('matches the test vector the API checks too', () => {
    expect(
      signRendererRequest('vector-secret-0123456789abcdef-0123456789', {
        timestamp: '1792900000',
        method: 'POST',
        path: '/public/sites/smilecare/leads',
        clientIp: '203.0.113.7',
        userAgent: 'Mozilla/5.0 (iPhone)',
        body: '{"name":"Hà"}',
      }),
    ).toBe('4a46ea6db046b4ade3873cac7cea0ca94ef9ca1819567471952f7404ac2de4f8');
  });
});

describe('clientAddress', () => {
  it('trusts no address without a proxy in front, whatever the client sent', () => {
    expect(clientAddress(headers({ 'x-forwarded-for': '203.0.113.7' }), false)).toBeNull();
  });

  it('takes the entry the trusted proxy appended, the last one', () => {
    expect(
      clientAddress(headers({ 'x-forwarded-for': '10.0.0.1, 198.51.100.4, 203.0.113.7' }), true),
    ).toBe('203.0.113.7');
    expect(clientAddress(headers({ 'x-forwarded-for': '2001:db8::1' }), true)).toBe('2001:db8::1');
  });

  it('ignores a missing or malformed header', () => {
    expect(clientAddress(headers({}), true)).toBeNull();
    expect(clientAddress(headers({ 'x-forwarded-for': 'not-an-ip' }), true)).toBeNull();
  });
});
