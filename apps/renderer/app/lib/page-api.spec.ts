import { describe, expect, it } from 'vitest';

import { resolveRendererApiBaseUrl } from './page-api';

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
