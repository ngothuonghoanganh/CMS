import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { fetchPublicJson } from './public-fetch';

const schema = z.object({ name: z.string() });

function stubFetch(response: Response | Error) {
  const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function call(extra: { cache?: RequestCache } = {}) {
  return fetchPublicJson({
    baseUrl: 'http://api.test',
    path: '/public/sites/smilecare/resolve',
    query: { path: 'uu-dai' },
    schema,
    label: 'publicResolve',
    ...extra,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchPublicJson', () => {
  it('GETs the endpoint with its query and returns the validated body', async () => {
    const fetchMock = stubFetch(Response.json({ name: 'Smile Care', internal: 'dropped' }));
    await expect(call()).resolves.toEqual({ name: 'Smile Care' });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('http://api.test/public/sites/smilecare/resolve?path=uu-dai');
    expect(init?.method).toBe('GET');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init && 'cache' in init).toBe(false);
  });

  it('passes an explicit cache mode through', async () => {
    const fetchMock = stubFetch(Response.json({ name: 'x' }));
    await call({ cache: 'no-store' });
    expect(fetchMock.mock.calls[0]?.[1]?.cache).toBe('no-store');
  });

  it('answers null for a 404', async () => {
    stubFetch(Response.json({ code: 'not_found' }, { status: 404 }));
    await expect(call()).resolves.toBeNull();
  });

  it('throws for any other error status', async () => {
    stubFetch(new Response('boom', { status: 500 }));
    await expect(call()).rejects.toThrow('Public API request publicResolve answered HTTP 500');
  });

  it('throws with the cause when the API is unreachable', async () => {
    const cause = new TypeError('fetch failed');
    stubFetch(cause);
    await expect(call()).rejects.toMatchObject({
      message: 'Public API request publicResolve failed',
      cause,
    });
  });

  it('throws when the body is not JSON or does not match the contract', async () => {
    stubFetch(new Response('<html>', { status: 200 }));
    await expect(call()).rejects.toThrow('returned invalid JSON');
    stubFetch(Response.json({ name: 42 }));
    await expect(call()).rejects.toThrow('does not match the contract');
  });

  it('keeps the request URL (which may hold a token) out of error messages', async () => {
    stubFetch(new Response('', { status: 500 }));
    await expect(
      fetchPublicJson({
        baseUrl: 'http://api.test',
        path: '/public/preview/secret-token',
        schema,
        label: 'publicPreview',
      }),
    ).rejects.toThrow(/^(?!.*secret-token).*$/);
  });
});
