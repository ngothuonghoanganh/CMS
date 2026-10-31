import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicPreviewStatusResponse } from '@plp/contracts';
import { getPathStatus, getPreview, getPreviewStatus } from './lib/public-api';
import { config, proxy, UNKNOWN_USER_AGENT } from './proxy';

vi.mock('./lib/public-api', () => ({
  getPathStatus: vi.fn(),
  getPreview: vi.fn(),
  getPreviewStatus: vi.fn(),
}));

const getPathStatusMock = vi.mocked(getPathStatus);
const getPreviewMock = vi.mocked(getPreview);
const getPreviewStatusMock = vi.mocked(getPreviewStatus);

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJraW5kIjoiZHJhZnQifQ.c2lnbmF0dXJl';

const RELEASE_ID = 'c'.repeat(24);
const FORGED_ID = 'f'.repeat(24);

function request(
  path: string,
  host = 'smilecare.localhost:3101',
  extra: Record<string, string> = {},
): NextRequest {
  return new NextRequest(`http://${host}${path}`, { headers: { host, ...extra } });
}

/** The value of a request header that `NextResponse.next({ request: { headers } })` forwards. */
function forwardedHeader(response: Response, name: string): string | null {
  const overridden = (response.headers.get('x-middleware-override-headers') ?? '').split(',');
  return overridden.includes(name) ? response.headers.get(`x-middleware-request-${name}`) : null;
}

beforeEach(() => {
  vi.stubEnv('API_PUBLIC_URL', 'http://api.test');
  vi.stubEnv('BASE_DOMAIN', 'localhost:3101');
  vi.stubEnv('PUBLIC_SITE_PROTOCOL', 'http');
  vi.stubEnv('REVALIDATE_SECRET', 's'.repeat(32));
  vi.stubEnv('RENDERER_API_SECRET', 'r'.repeat(32));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('proxy', () => {
  it('rewrites a miss to the server-rendered not-found page with status 404', async () => {
    getPathStatusMock.mockResolvedValue(null);
    const response = await proxy(request('/khong-co'));
    expect(response.status).toBe(404);
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'http://smilecare.localhost:3101/_not-found',
    );
    expect(getPathStatusMock).toHaveBeenCalledWith('smilecare', 'khong-co');
  });

  it('rewrites an unknown host without asking the API', async () => {
    const response = await proxy(request('/', 'evil.example'));
    expect(response.status).toBe(404);
    expect(getPathStatusMock).not.toHaveBeenCalled();
  });

  it('lets a live page render and hands it the live release for its cache key', async () => {
    getPathStatusMock.mockResolvedValue({ kind: 'page', releaseId: RELEASE_ID });
    const response = await proxy(request('/uu-dai'));
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    expect(forwardedHeader(response, 'x-plp-live-release')).toBe(RELEASE_ID);
  });

  it('replaces a live release sent by the client with its own', async () => {
    getPathStatusMock.mockResolvedValue({ kind: 'page', releaseId: RELEASE_ID });
    const response = await proxy(
      request('/uu-dai', 'smilecare.localhost:3101', { 'x-plp-live-release': FORGED_ID }),
    );
    expect(forwardedHeader(response, 'x-plp-live-release')).toBe(RELEASE_ID);
  });

  it('answers an old slug with a 308 itself, before the page renders', async () => {
    // Without a User-Agent, Next would stream the page's own redirect as a 200 shell.
    getPathStatusMock.mockResolvedValue({ kind: 'redirect', location: '/moi' });
    const response = await proxy(request('/cu'));
    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('http://smilecare.localhost:3101/moi');
    expect(response.headers.get('x-middleware-next')).toBeNull();
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    expect(getPathStatusMock).toHaveBeenCalledOnce();
    expect(getPathStatusMock).toHaveBeenCalledWith('smilecare', 'cu');
  });

  it('keeps the visitor’s query on the redirect: utm tags and click ids reach the new slug', async () => {
    getPathStatusMock.mockResolvedValue({ kind: 'redirect', location: '/moi' });
    const response = await proxy(request('/cu?utm_source=zalo&utm_campaign=t11&gclid=abc123'));
    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(
      'http://smilecare.localhost:3101/moi?utm_source=zalo&utm_campaign=t11&gclid=abc123',
    );
    expect(getPathStatusMock).toHaveBeenCalledWith('smilecare', 'cu');
  });

  it('never follows a redirect the API names off the site', async () => {
    getPathStatusMock.mockResolvedValue({ kind: 'redirect', location: '//evil.example/x' });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await proxy(
      request('/cu', 'smilecare.localhost:3101', { 'x-plp-live-release': FORGED_ID }),
    );
    expect(response.status).toBe(503);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBeNull();
  });

  // A 404 would tell crawlers the page is gone, a 200 shell that it is blank; rendering anyway
  // would only wait on the same API again.
  it('answers 503 with Retry-After when the API cannot answer, without rendering', async () => {
    const error = new Error('API down');
    getPathStatusMock.mockRejectedValue(error);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await proxy(request('/uu-dai'));
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('x-middleware-next')).toBeNull();
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    const html = await response.text();
    expect(html).toContain('<html lang="vi">');
    expect(html).toContain('<h1>Trang tạm thời chưa mở được</h1>');
    expect(html).toContain('Vui lòng thử lại sau ít phút.');
    // A public page keeps its place in search results; only previews say noindex.
    expect(html).not.toContain('noindex');
    expect(response.headers.get('x-robots-tag')).toBeNull();
    expect(log).toHaveBeenCalledWith('Path check failed; answering 503', error);
  });

  // Next renders in blocking mode (real statuses) only for requests that send a User-Agent.
  it('gives a request without a User-Agent one, so the page never streams a 200 shell', async () => {
    getPathStatusMock.mockResolvedValue({ kind: 'page', releaseId: RELEASE_ID });
    const bare = await proxy(request('/uu-dai'));
    expect(forwardedHeader(bare, 'user-agent')).toBe(UNKNOWN_USER_AGENT);
    const blank = await proxy(
      request('/uu-dai', 'smilecare.localhost:3101', { 'user-agent': ' ' }),
    );
    expect(forwardedHeader(blank, 'user-agent')).toBe(UNKNOWN_USER_AGENT);
    const browser = await proxy(
      request('/uu-dai', 'smilecare.localhost:3101', { 'user-agent': 'Mozilla/5.0 (iPhone)' }),
    );
    expect(forwardedHeader(browser, 'user-agent')).toBe('Mozilla/5.0 (iPhone)');
  });

  // Without it Next sends the static not-found page with `s-maxage` of a year: a shared cache
  // would keep answering 404 after a page is published at that path.
  it('renders the not-found page with the same request headers as a page', async () => {
    getPathStatusMock.mockResolvedValue(null);
    const response = await proxy(request('/khong-co'));
    expect(response.status).toBe(404);
    expect(forwardedHeader(response, 'user-agent')).toBe(UNKNOWN_USER_AGENT);
  });
});

function statusOf(subdomain: string): PublicPreviewStatusResponse {
  return { kind: 'draft', subdomain };
}

describe('proxy for previews', () => {
  it('lets a valid preview of this site render, checking only the token', async () => {
    getPreviewStatusMock.mockResolvedValue(statusOf('smilecare'));
    const response = await proxy(request(`/_preview/${TOKEN}`));
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(getPreviewStatusMock).toHaveBeenCalledWith(TOKEN);
    // The page makes the one full load of the preview.
    expect(getPreviewMock).not.toHaveBeenCalled();
    expect(getPathStatusMock).not.toHaveBeenCalled();
  });

  // An expired token, another key id or a bad signature: the API answers 404 for all of them.
  it('rewrites an invalid or expired token to the server-rendered not-found page', async () => {
    getPreviewStatusMock.mockResolvedValue(null);
    const response = await proxy(request(`/_preview/${TOKEN}`));
    expect(response.status).toBe(404);
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'http://smilecare.localhost:3101/_not-found',
    );
    expect(forwardedHeader(response, 'user-agent')).toBe(UNKNOWN_USER_AGENT);
  });

  it('answers the same 404 for a token of another site', async () => {
    getPreviewStatusMock.mockResolvedValue(statusOf('nhakhoakhac'));
    const response = await proxy(request(`/_preview/${TOKEN}`));
    expect(response.status).toBe(404);
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'http://smilecare.localhost:3101/_not-found',
    );
  });

  it.each([
    ['not a token', '/_preview/abc', 'smilecare.localhost:3101'],
    ['a host that is not a site', `/_preview/${TOKEN}`, 'localhost:3101'],
    ['a malformed escape', '/_preview/%E0%A4%A', 'smilecare.localhost:3101'],
  ])('answers 404 for %s without asking the API', async (_case, path, host) => {
    const response = await proxy(request(path, host));
    expect(response.status).toBe(404);
    expect(getPreviewStatusMock).not.toHaveBeenCalled();
    expect(getPreviewMock).not.toHaveBeenCalled();
  });

  it('answers 503, still noindex, when the API cannot answer', async () => {
    getPreviewStatusMock.mockRejectedValue(new Error('API down'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await proxy(request(`/_preview/${TOKEN}`));
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(response.headers.get('x-middleware-next')).toBeNull();
  });
});

describe('proxy matcher', () => {
  it.each(['/', '/uu-dai', '/_leadx', '/lead', '/_ex', '/e', '/_preview/abc'])(
    'gates the page or preview path %s',
    (url) => {
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
    },
  );

  it.each(['/_lead', '/_e', '/_next/static/x.js', '/api/revalidate', '/sitemap.xml'])(
    'leaves %s to its own route',
    (url) => {
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
    },
  );
});
