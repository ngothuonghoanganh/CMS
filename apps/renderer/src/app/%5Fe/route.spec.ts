import { createHmac } from 'node:crypto';
import { PAGE_VIEW_MAX_BYTES, pageViewSchema, rendererSignaturePayload } from '@plp/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const SECRET = 'renderer-secret-0123456789abcdef-0123';
const SITE = 'http://smilecare.localhost:3101';
const BROWSER_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)';

const fetchMock = vi.fn<typeof fetch>();

const VIEW = {
  path: '/uu-dai',
  source: { utmSource: 'facebook', utmMedium: 'cpc', utmCampaign: null, referrer: null },
};

/** A view as `navigator.sendBeacon` sends a string: text/plain holding JSON. */
function beacon(body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${SITE}/_e`, {
    method: 'POST',
    headers: {
      host: 'smilecare.localhost:3101',
      origin: SITE,
      'content-type': 'text/plain;charset=UTF-8',
      'user-agent': BROWSER_UA,
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv('API_PUBLIC_URL', 'http://api.test');
  vi.stubEnv('BASE_DOMAIN', 'localhost:3101');
  vi.stubEnv('PUBLIC_SITE_PROTOCOL', 'http');
  vi.stubEnv('REVALIDATE_SECRET', 'x'.repeat(32));
  vi.stubEnv('RENDERER_API_SECRET', SECRET);
  vi.stubEnv('TRUST_PROXY', 'true');
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetchMock.mockReset();
});

describe('POST /_e', () => {
  it('relays a view to the API, signed, with the visitor’s address and user agent', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const response = await POST(
      beacon(VIEW, { 'x-forwarded-for': '6.6.6.6, 203.0.113.7', 'x-plp-client-ip': '6.6.6.6' }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('http://api.test/public/sites/smilecare/events');
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === 'string' ? init.body : '';
    expect(JSON.parse(body)).toEqual(VIEW);
    // The last address the trusted proxy appended; a forged header never reaches the API.
    expect(headers.get('x-plp-client-ip')).toBe('203.0.113.7');
    expect(headers.get('x-plp-client-ua')).toBe(BROWSER_UA);
    const timestamp = headers.get('x-plp-renderer-timestamp') ?? '';
    expect(headers.get('x-plp-renderer-signature')).toBe(
      createHmac('sha256', SECRET)
        .update(
          rendererSignaturePayload({
            timestamp,
            method: 'POST',
            path: '/public/sites/smilecare/events',
            clientIp: '203.0.113.7',
            userAgent: BROWSER_UA,
            body,
          }),
        )
        .digest('hex'),
    );
  });

  it('drops views from another site, malformed or oversized ones, and still answers 204', async () => {
    const answers = await Promise.all([
      POST(beacon(VIEW, { origin: 'https://evil.example' })),
      POST(beacon(VIEW, { 'sec-fetch-site': 'cross-site' })),
      POST(beacon('{not json')),
      POST(beacon({ ...VIEW, path: 'uu-dai' })),
      POST(beacon({ ...VIEW, source: { ...VIEW.source, referrer: 'x'.repeat(3000) } })),
      POST(beacon(VIEW, { host: 'example.com' })),
    ]);
    expect(answers.map((answer) => answer.status)).toEqual([204, 204, 204, 204, 204, 204]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('drops a view over 2 KB even when each of its fields is within its limit', async () => {
    const long = {
      path: `/${'a'.repeat(511)}`,
      source: {
        utmSource: 'u'.repeat(500),
        utmMedium: 'm'.repeat(500),
        utmCampaign: null,
        referrer: `https://example.com/${'r'.repeat(970)}`,
      },
    };
    expect(pageViewSchema.safeParse(long).success).toBe(true);
    expect(JSON.stringify(long).length).toBeGreaterThan(PAGE_VIEW_MAX_BYTES);

    expect((await POST(beacon(long))).status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers 204 when the API refuses the view or cannot be reached, logging the status only', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect((await POST(beacon(VIEW))).status).toBe(204);
    expect((await POST(beacon(VIEW))).status).toBe(204);
    expect(console.error).toHaveBeenCalledWith('Page view relay was refused by the API', {
      status: 401,
    });
    expect(console.error).toHaveBeenCalledWith('Page view relay could not reach the API', {
      reason: 'TypeError',
    });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('uu-dai');
  });
});
