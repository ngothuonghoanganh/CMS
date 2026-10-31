import { createHmac } from 'node:crypto';
import {
  CLIENT_UA_HEADER,
  CLIENT_UA_MAX,
  RENDERER_SIGNATURE_HEADER,
  rendererSignaturePayload,
} from '@plp/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clientAddress } from './client-address';
import { signRendererRequest } from './renderer-signature';
import { sendSignedRelay } from './signed-relay';

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

describe('sendSignedRelay', () => {
  const SECRET = 'renderer-secret-0123456789abcdef-0123';
  const PATH = '/public/sites/smilecare/leads';
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  // In-app browsers send user agents longer than the API reads. Headers drops a blank at the end
  // of a value, so a cut that ends on one reaches the API one character shorter.
  it.each([
    ['a letter', 'X', `${'x'.repeat(CLIENT_UA_MAX - 1)}X`],
    ['a space', ' ', 'x'.repeat(CLIENT_UA_MAX - 1)],
    ['a tab', '\t', 'x'.repeat(CLIENT_UA_MAX - 1)],
    // Not HTTP whitespace: it stays on the wire, so it must stay in what is signed.
    ['a no-break space', '\u00a0', `${'x'.repeat(CLIENT_UA_MAX - 1)}\u00a0`],
  ])('signs a long user agent cut on %s as the API receives it', async (_cut, last, received) => {
    await sendSignedRelay({
      path: PATH,
      body: { name: 'Hà' },
      clientIp: '203.0.113.7',
      userAgent: `${'x'.repeat(CLIENT_UA_MAX - 1)}${last}${'y'.repeat(600 - CLIENT_UA_MAX)}`,
      env: { API_PUBLIC_URL: 'http://api.test', RENDERER_API_SECRET: SECRET },
      timeoutMs: 1000,
      nowSeconds: 1_792_900_000,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(sent.get(CLIENT_UA_HEADER)).toBe(received);
    // What the API verifies: the HMAC over the shared payload of the headers it read.
    expect(sent.get(RENDERER_SIGNATURE_HEADER)).toBe(
      createHmac('sha256', SECRET)
        .update(
          rendererSignaturePayload({
            timestamp: '1792900000',
            method: 'POST',
            path: PATH,
            clientIp: '203.0.113.7',
            userAgent: received,
            body: '{"name":"Hà"}',
          }),
        )
        .digest('hex'),
    );
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

  // The edge proxy appends the address it saw; everything before it is what the client wrote.
  it('never lets a spoofed leading entry pick the bucket', () => {
    for (const spoofed of ['6.6.6.6', '6.6.6.6, 7.7.7.7', '::1', 'unknown', '']) {
      const forwarded = spoofed === '' ? '203.0.113.7' : `${spoofed}, 203.0.113.7`;
      expect(clientAddress(headers({ 'x-forwarded-for': forwarded }), true)).toBe('203.0.113.7');
    }
    // A client cannot end the list either: a value of its own is followed by the proxy's entry.
    expect(clientAddress(headers({ 'x-forwarded-for': '6.6.6.6,' }), true)).toBeNull();
  });

  it('reads the last entry across several header lines, as the edge proxy added its own', () => {
    const lines = new Headers();
    lines.append('x-forwarded-for', '6.6.6.6');
    lines.append('x-forwarded-for', '203.0.113.7');
    expect(clientAddress(lines, true)).toBe('203.0.113.7');
  });

  it('spells every IPv6 address one way, so one visitor has one bucket', () => {
    const of = (value: string) => clientAddress(headers({ 'x-forwarded-for': value }), true);
    expect(of('2001:DB8:0:0:0:0:0:1')).toBe('2001:db8::1');
    expect(of('2001:db8::1')).toBe('2001:db8::1');
    expect(of('::1')).toBe('::1');
  });

  // A dual-stack proxy reports an IPv4 visitor as `::ffff:a.b.c.d`; it is the same visitor.
  it('reads an IPv4-mapped IPv6 address as the IPv4 address', () => {
    const of = (value: string) => clientAddress(headers({ 'x-forwarded-for': value }), true);
    expect(of('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(of('::FFFF:203.0.113.7')).toBe('203.0.113.7');
    expect(of('::ffff:cb00:7107')).toBe('203.0.113.7');
    expect(of('::ffff:127.0.0.1')).toBe('127.0.0.1');
    // Other prefixes are real IPv6 addresses, not mapped IPv4.
    expect(of('64:ff9b::203.0.113.7')).toBe('64:ff9b::cb00:7107');
    expect(of('::ffff:0:203.0.113.7')).toBe('::ffff:0:cb00:7107');
  });

  it('drops the port or brackets a proxy may add', () => {
    const of = (value: string) => clientAddress(headers({ 'x-forwarded-for': value }), true);
    expect(of('203.0.113.7:4711')).toBe('203.0.113.7');
    expect(of('[2001:db8::1]:443')).toBe('2001:db8::1');
    expect(of('[2001:db8::1]')).toBe('2001:db8::1');
    expect(of('[::ffff:203.0.113.7]:443')).toBe('203.0.113.7');
  });

  it('trusts nothing that is not one address', () => {
    const of = (value: string) => clientAddress(headers({ 'x-forwarded-for': value }), true);
    for (const value of [
      '203.0.113.256',
      '203.0.113',
      '203.0.113.7:port',
      '[2001:db8::1',
      'fe80::1%en0',
      'unknown',
      '_hidden',
    ]) {
      expect(of(value), value).toBeNull();
    }
  });
});
