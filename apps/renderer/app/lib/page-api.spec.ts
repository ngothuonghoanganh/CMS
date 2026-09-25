import { describe, expect, it } from 'vitest';

import {
  previewPageUnavailableReason,
  readPreviewPageResponse,
  resolveRendererApiBaseUrl,
} from './page-api';

describe('resolveRendererApiBaseUrl', () => {
  it('prefers the server-only renderer API endpoint', () => {
    expect(
      resolveRendererApiBaseUrl({
        RENDERER_API_BASE_URL: 'http://127.0.0.1:3011/api/v1/',
        NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:3001/api/v1',
      }),
    ).toBe('http://127.0.0.1:3011/api/v1');
  });

  it('uses the public API endpoint when the server-only value is unavailable', () => {
    expect(
      resolveRendererApiBaseUrl({
        NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:3011/api/v1/',
      }),
    ).toBe('http://127.0.0.1:3011/api/v1');
  });

  it('keeps the local API default as the final fallback', () => {
    expect(resolveRendererApiBaseUrl({})).toBe('http://127.0.0.1:3001/api/v1');
  });
});

describe('preview page response handling', () => {
  it.each([
    [401, 'authentication'],
    [403, 'forbidden'],
    [404, 'not-found'],
  ] as const)('classifies HTTP %s as %s', (status, reason) => {
    expect(previewPageUnavailableReason(status)).toBe(reason);
  });

  it('does not report a missing page as an authentication failure', async () => {
    const result = await readPreviewPageResponse(new Response(null, { status: 404 }));

    expect(result).toEqual({ page: null, reason: 'not-found' });
  });

  it('classifies an expired preview session separately', async () => {
    const result = await readPreviewPageResponse(new Response(null, { status: 401 }));

    expect(result).toEqual({ page: null, reason: 'authentication' });
  });
});
