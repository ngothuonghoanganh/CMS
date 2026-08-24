import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from './api';

describe('api client authentication recovery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refreshes when the access cookie is gone but the session is still refreshable', async () => {
    let authMeCalls = 0;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({}), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      if (url.endsWith('/auth/me')) {
        authMeCalls += 1;
        if (authMeCalls > 1) {
          return new Response(JSON.stringify({ ok: true }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          });
        }

        return new Response(
          JSON.stringify({
            error: {
              code: 'UNAUTHENTICATED',
              message: 'Authentication is required',
              requestId: '8e45c3a9-c7a0-4024-bb77-d9f4d92a90af',
            },
          }),
          {
            headers: { 'Content-Type': 'application/json' },
            status: 401,
          },
        );
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });
    });

    await expect(api.get('/auth/me')).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      'http://127.0.0.1:3001/api/v1/auth/me',
      'http://127.0.0.1:3001/api/v1/auth/refresh',
      'http://127.0.0.1:3001/api/v1/auth/me',
    ]);
  });

  it('coalesces concurrent GETs without caching completed responses', async () => {
    let release: (() => void) | undefined;
    const fetchStarted = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      release?.();
      await fetchStarted;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });
    });

    const first = api.get('/auth/me');
    const second = api.get('/auth/me');
    await expect(Promise.all([first, second])).resolves.toEqual([
      { ok: true },
      { ok: true },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(api.get('/auth/me')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
