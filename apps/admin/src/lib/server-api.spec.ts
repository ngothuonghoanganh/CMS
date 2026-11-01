import { endpoints, SESSION_COOKIE } from '@plp/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serverApi } from './server-api';

let cookieHeader: string | null = null;
vi.mock('next/headers', () => ({
  headers: () =>
    Promise.resolve(new Headers(cookieHeader === null ? {} : { cookie: cookieHeader })),
}));

function stubFetch() {
  const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
    Promise.resolve(
      Response.json({
        user: { id: '64b0000000000000000000c9', name: 'Thùy', email: 'thuy@example.vn' },
        memberships: [],
      }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function forwardedCookie(fetchMock: ReturnType<typeof stubFetch>): string | null {
  return new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('cookie');
}

beforeEach(() => {
  vi.stubEnv('API_INTERNAL_URL', 'http://api.test');
  vi.stubEnv('PUBLIC_SITE_ORIGIN_TEMPLATE', 'https://{subdomain}.payload.site');
});

afterEach(() => {
  cookieHeader = null;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('serverApi', () => {
  // A host-only cookie and one on the workspace addresses' parent domain meet after a deployment
  // switched modes; only one of them is valid, and the API picks it (ADR-025).
  it('forwards every session cookie the browser sent, in its order', async () => {
    cookieHeader = `${SESSION_COOKIE}=host-only; plp_ws=64b0000000000000000000a1; ${SESSION_COOKIE}=parent-domain`;
    const fetchMock = stubFetch();
    await serverApi(endpoints.me, []);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://api.test/auth/me');
    expect(forwardedCookie(fetchMock)).toBe(cookieHeader);
    expect(fetchMock.mock.calls[0]?.[1]?.cache).toBe('no-store');
  });

  it('sends no cookie header without cookies', async () => {
    const fetchMock = stubFetch();
    await serverApi(endpoints.me, []);
    expect(forwardedCookie(fetchMock)).toBeNull();
  });
});
