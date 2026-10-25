import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPathStatus } from './lib/public-api';
import { config, proxy } from './proxy';

vi.mock('./lib/public-api', () => ({ getPathStatus: vi.fn() }));

const getPathStatusMock = vi.mocked(getPathStatus);

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

  it('lets the page decide when the API names a redirect off the site', async () => {
    getPathStatusMock.mockResolvedValue({ kind: 'redirect', location: '//evil.example/x' });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await proxy(
      request('/cu', 'smilecare.localhost:3101', { 'x-plp-live-release': FORGED_ID }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(forwardedHeader(response, 'x-plp-live-release')).toBeNull();
  });

  it('logs a failed check and lets the page decide, still dropping a client value', async () => {
    const error = new Error('API down');
    getPathStatusMock.mockRejectedValue(error);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await proxy(
      request('/uu-dai', 'smilecare.localhost:3101', { 'x-plp-live-release': FORGED_ID }),
    );
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(forwardedHeader(response, 'x-plp-live-release')).toBeNull();
    expect(log).toHaveBeenCalledWith('Path check failed; rendering the page instead', error);
  });
});

describe('proxy matcher', () => {
  it.each(['/', '/uu-dai', '/_leadx', '/lead', '/_ex', '/e'])('gates the page path %s', (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
  });

  it.each([
    '/_lead',
    '/_e',
    '/_preview/abc',
    '/_next/static/x.js',
    '/api/revalidate',
    '/sitemap.xml',
  ])('leaves %s to its own route', (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
  });
});
