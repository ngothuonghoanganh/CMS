import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPathStatus } from './lib/public-api';
import { proxy } from './proxy';

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

  it('lets a redirect render without a live release, dropping a client value', async () => {
    getPathStatusMock.mockResolvedValue({ kind: 'redirect' });
    const response = await proxy(
      request('/cu', 'smilecare.localhost:3101', { 'x-plp-live-release': FORGED_ID }),
    );
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
    expect(log).toHaveBeenCalledWith('Not-found check failed; rendering the page instead', error);
  });
});
