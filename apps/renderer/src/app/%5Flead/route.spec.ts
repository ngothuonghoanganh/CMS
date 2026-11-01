import { createHmac } from 'node:crypto';
import { LEAD_PHONE_MESSAGE, rendererSignaturePayload } from '@plp/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';

const SECRET = 'renderer-secret-0123456789abcdef-0123';
const RELEASE_ID = 'c'.repeat(24);
const SITE = 'http://smilecare.localhost:3101';
const BROWSER_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)';

const fetchMock = vi.fn<typeof fetch>();

function lead(overrides: Record<string, unknown> = {}) {
  return {
    releaseId: RELEASE_ID,
    submissionId: '3f1c2a9e-7b5d-4e8f-9a01-6c2d3e4f5a6b',
    name: 'Nguyễn Thu Hà',
    phone: '0901 234 567',
    email: '',
    message: '',
    consent: true,
    marketing: false,
    honeypot: '',
    elapsedMs: 9000,
    source: { utmSource: null, utmMedium: null, utmCampaign: null, referrer: null },
    ...overrides,
  };
}

function scriptPost(body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${SITE}/_lead`, {
    method: 'POST',
    headers: {
      host: 'smilecare.localhost:3101',
      origin: SITE,
      'content-type': 'application/json',
      'user-agent': BROWSER_UA,
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function formPost(fields: Record<string, string>, headers: Record<string, string> = {}) {
  return new Request(`${SITE}/_lead`, {
    method: 'POST',
    headers: {
      host: 'smilecare.localhost:3101',
      origin: SITE,
      referer: `${SITE}/uu-dai?utm_source=facebook&utm_medium=cpc`,
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': BROWSER_UA,
      ...headers,
    },
    body: new URLSearchParams(fields).toString(),
  });
}

const FORM_FIELDS = {
  releaseId: RELEASE_ID,
  website: '',
  name: 'Nguyễn Thu Hà',
  phone: '0901 234 567',
  consent: 'yes',
};

function apiAnswer(status: number, body: unknown = null): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  });
}

/** The single call the route made to the API; the relay always sends its JSON as a string. */
function relayedCall(): { url: string; init: RequestInit; headers: Headers; body: string } {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] ?? [];
  if (typeof url !== 'string' || init === undefined || typeof init.body !== 'string') {
    throw new Error('No relayed call with a JSON body');
  }
  return { url, init, headers: new Headers(init.headers), body: init.body };
}

beforeEach(() => {
  vi.stubEnv('API_PUBLIC_URL', 'http://api.test');
  vi.stubEnv('BASE_DOMAIN', 'localhost:3101');
  vi.stubEnv('PUBLIC_SITE_PROTOCOL', 'http');
  vi.stubEnv('REVALIDATE_SECRET', 'x'.repeat(32));
  vi.stubEnv('RENDERER_API_SECRET', SECRET);
  vi.stubEnv('TRUST_PROXY', 'false');
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetchMock.mockReset();
});

describe('POST /_lead from the page script', () => {
  it('relays a valid lead to the API, signed, with headers built from scratch', async () => {
    fetchMock.mockResolvedValueOnce(apiAnswer(201, { status: 'received' }));
    const response = await POST(
      scriptPost(lead(), {
        // Forged internal headers never reach the API.
        'x-plp-client-ip': '6.6.6.6',
        'x-plp-renderer-signature': 'f'.repeat(64),
        'x-forwarded-for': '6.6.6.6',
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get('cache-control')).toBe('no-store');

    const { url, init, headers, body } = relayedCall();
    expect(url).toBe('http://api.test/public/sites/smilecare/leads');
    expect(init.method).toBe('POST');
    // Without a trusted proxy no address is passed on: the visitor shares the site's bucket.
    expect(headers.get('x-plp-client-ip')).toBeNull();
    expect(headers.get('x-plp-client-ua')).toBe(BROWSER_UA);
    const timestamp = headers.get('x-plp-renderer-timestamp') ?? '';
    expect(headers.get('x-plp-renderer-signature')).toBe(
      createHmac('sha256', SECRET)
        .update(
          rendererSignaturePayload({
            timestamp,
            method: 'POST',
            path: '/public/sites/smilecare/leads',
            clientIp: '',
            userAgent: BROWSER_UA,
            body,
          }),
        )
        .digest('hex'),
    );
    expect(JSON.parse(body)).toEqual(lead());
  });

  it('passes on the address the trusted proxy appended', async () => {
    vi.stubEnv('TRUST_PROXY', 'true');
    fetchMock.mockResolvedValueOnce(apiAnswer(201, { status: 'received' }));
    await POST(scriptPost(lead(), { 'x-forwarded-for': '6.6.6.6, 203.0.113.7' }));
    expect(relayedCall().headers.get('x-plp-client-ip')).toBe('203.0.113.7');
  });

  it('answers problems itself, with the messages of the API, without calling it', async () => {
    const response = await POST(scriptPost(lead({ phone: '090123456', consent: false })));
    expect(response.status).toBe(422);
    const body = (await response.json()) as { issues: { path: string[]; message: string }[] };
    expect(body.issues.map((issue) => [issue.path[0], issue.message])).toEqual([
      ['phone', LEAD_PHONE_MESSAGE],
      ['consent', 'Bạn cần đồng ý để gửi đăng ký'],
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      429,
      { title: 'Bạn đã gửi nhiều lần', detail: 'Bạn đã gửi nhiều lần, hãy thử lại sau ít phút.' },
      429,
    ],
    [404, null, 404],
    [500, null, 502],
  ])('maps an API answer %i to %i', async (apiStatus, body, routeStatus) => {
    fetchMock.mockResolvedValueOnce(
      apiAnswer(
        apiStatus,
        body === null
          ? null
          : { type: 'about:blank', status: apiStatus, code: 'rate_limited', ...body },
      ),
    );
    const response = await POST(scriptPost(lead()));
    expect(response.status).toBe(routeStatus);
    expect(((await response.json()) as { ok: boolean }).ok).toBe(false);
  });

  it('reports an unreachable API without logging the lead', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    const response = await POST(scriptPost(lead({ name: 'Trần Quốc Bảo' })));
    expect(response.status).toBe(502);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('Trần Quốc Bảo');
  });

  it('refuses another site, unknown hosts, other content types and oversized bodies', async () => {
    expect((await POST(scriptPost(lead(), { origin: 'https://evil.example' }))).status).toBe(403);
    expect((await POST(scriptPost(lead(), { 'sec-fetch-site': 'cross-site' }))).status).toBe(403);
    expect((await POST(scriptPost(lead(), { host: 'localhost:3101' }))).status).toBe(404);
    expect((await POST(scriptPost('x', { 'content-type': 'text/plain' }))).status).toBe(415);
    expect((await POST(scriptPost('{not json'))).status).toBe(400);
    const huge = JSON.stringify(lead({ message: 'x'.repeat(40_000) }));
    expect((await POST(scriptPost(huge))).status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST /_lead without JavaScript', () => {
  it('relays the form and redirects to the result page (post/redirect/get)', async () => {
    fetchMock.mockResolvedValueOnce(apiAnswer(201, { status: 'received' }));
    const response = await POST(formPost(FORM_FIELDS));
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/_lead?status=received&back=%2Fuu-dai');
    // Campaign tags come from the page address in the Referer; there is no submission id.
    expect(JSON.parse(relayedCall().body)).toMatchObject({
      submissionId: null,
      elapsedMs: null,
      consent: true,
      email: '',
      source: { utmSource: 'facebook', utmMedium: 'cpc', utmCampaign: null, referrer: null },
    });
  });

  it('answers a page that lists the problems when the consent box is not ticked', async () => {
    const { consent: _unticked, ...fields } = FORM_FIELDS;
    const response = await POST(formPost(fields));
    expect(response.status).toBe(422);
    expect(response.headers.get('content-type')).toContain('text/html');
    const html = await response.text();
    expect(html).toContain('Bạn cần đồng ý để gửi đăng ký');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    // Back to the form with the page's campaign tags, so the lead sent again keeps its source.
    expect(html).toContain('href="/uu-dai?utm_source=facebook&amp;utm_medium=cpc"');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never links back off the site', async () => {
    const response = await POST(
      formPost({ ...FORM_FIELDS, phone: '1' }, { referer: 'https://evil.example/uu-dai' }),
    );
    expect(await response.text()).toContain('href="/"');
  });
});

describe('GET /_lead', () => {
  it('shows the received page with a safe link back', async () => {
    const response = GET(new Request(`${SITE}/_lead?status=received&back=%2Fuu-dai`));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('Đã nhận đăng ký của bạn');
    expect(html).toContain('href="/uu-dai"');
    expect(
      await GET(new Request(`${SITE}/_lead?status=received&back=%2F%2Fevil.example`)).text(),
    ).toContain('href="/"');
    expect(GET(new Request(`${SITE}/_lead`)).status).toBe(404);
  });
});
