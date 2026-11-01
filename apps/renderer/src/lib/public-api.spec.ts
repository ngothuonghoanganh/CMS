import type { PublicPageData, ResolveResponse, SitemapResponse } from '@plp/contracts';
import { cacheLife, cacheTag } from 'next/cache';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHECK_TIMEOUT_MS,
  getPathStatus,
  getPreview,
  getPreviewStatus,
  getResolved,
  getSitemap,
  LOOKUP_TIMEOUT_MS,
  SITE_CACHE_LIFE,
  getCachedSitemap,
} from './public-api';

vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));

const SITE_ID = 'a'.repeat(24);
const PAGE_ID = 'b'.repeat(24);
const RELEASE_ID = 'c'.repeat(24);

const pageData: PublicPageData = {
  site: {
    id: SITE_ID,
    name: 'Smile Care',
    subdomain: 'smilecare',
    themePresetId: 'mint',
    logo: null,
    origin: 'http://smilecare.localhost:3101',
  },
  page: {
    id: PAGE_ID,
    slug: '',
    seo: {
      title: 'Smile Care',
      description: '',
      shareImage: null,
      noindex: false,
      canonicalUrl: 'http://smilecare.localhost:3101/',
    },
    composition: { version: 1, sections: [] },
  },
  assets: {},
  pageLinks: {},
  releaseId: 'd'.repeat(24),
  leadCapture: null,
};

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
    Promise.resolve(Response.json(body, { status })),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
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
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('getResolved', () => {
  it('tags the entry with the site tag and a 5-minute safety lifetime', async () => {
    const resolved: ResolveResponse = { kind: 'page', data: pageData };
    const fetchMock = stubFetch(200, resolved);
    await expect(getResolved('smilecare', '', RELEASE_ID)).resolves.toEqual(resolved);
    expect(cacheTag).toHaveBeenCalledWith('site:smilecare');
    expect(cacheLife).toHaveBeenCalledWith(SITE_CACHE_LIFE);
    expect(SITE_CACHE_LIFE.revalidate).toBe(300);
    // The live release only keys the cache entry; the API resolves by site and path alone.
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://api.test/public/sites/smilecare/resolve?path=',
    );
  });

  it('passes the slug as the path query', async () => {
    const fetchMock = stubFetch(200, { kind: 'redirect', location: '/moi' });
    await expect(getResolved('smilecare', 'cu', '')).resolves.toEqual({
      kind: 'redirect',
      location: '/moi',
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://api.test/public/sites/smilecare/resolve?path=cu',
    );
  });

  it('returns a tagged null for a 404 so the miss is cached and revalidated with the site', async () => {
    stubFetch(404, { code: 'not_found' });
    await expect(getResolved('smilecare', 'chua-co', '')).resolves.toBeNull();
    expect(cacheTag).toHaveBeenCalledWith('site:smilecare');
  });

  // The cached function must never throw: Next 16 never ends a response that awaits a failed
  // cached lookup from both its metadata and its page. The failure is kept for no time at all and
  // thrown by the caller, outside the cache.
  it('keeps an API error out of the cache and throws it outside, after logging its cause', async () => {
    stubFetch(503, { code: 'internal' });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(getResolved('smilecare', '', RELEASE_ID)).rejects.toThrow(
      'Public API lookup publicResolve failed',
    );
    expect(cacheLife).toHaveBeenCalledOnce();
    expect(cacheLife).toHaveBeenCalledWith({ stale: 0, revalidate: 0, expire: 0 });
    expect(log).toHaveBeenCalledWith(
      'Public API lookup publicResolve failed; nothing cached',
      expect.objectContaining({ message: 'Public API request publicResolve answered HTTP 503' }),
    );
  });

  it('gives up on a hung API after the lookup timeout', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    stubFetch(200, { kind: 'redirect', location: '/moi' });
    await getResolved('smilecare', 'cu', '');
    expect(timeout).toHaveBeenCalledWith(LOOKUP_TIMEOUT_MS);
  });
});

describe('timeouts', () => {
  // The proxy's check, then the page's lookup: a visitor never waits on the API for longer.
  it('keep the wait of a page request within 8 seconds', () => {
    expect(CHECK_TIMEOUT_MS + LOOKUP_TIMEOUT_MS).toBeLessThanOrEqual(8000);
  });

  it('give the proxy check the shorter one', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    stubFetch(200, { kind: 'page', releaseId: RELEASE_ID, primaryHost: null });
    await getPathStatus('smilecare', '');
    expect(timeout).toHaveBeenCalledWith(CHECK_TIMEOUT_MS);
    expect(CHECK_TIMEOUT_MS).toBeLessThan(LOOKUP_TIMEOUT_MS);
  });
});

describe('getSitemap', () => {
  it('is read live, never cached, and returns null for an unknown site', async () => {
    const sitemap: SitemapResponse = {
      origin: 'http://smilecare.localhost:3101',
      entries: [{ path: '/', lastModified: '2026-10-24T08:00:00.000Z' }],
    };
    const fetchMock = stubFetch(200, sitemap);
    await expect(getSitemap('smilecare')).resolves.toEqual(sitemap);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://api.test/public/sites/smilecare/sitemap');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store' });
    // A publish shows at once: no entry for a lost or late revalidation to leave behind.
    expect(cacheTag).not.toHaveBeenCalled();
    expect(cacheLife).not.toHaveBeenCalled();

    stubFetch(404, { code: 'not_found' });
    await expect(getSitemap('khong-co')).resolves.toBeNull();
  });

  it('throws an API error', async () => {
    stubFetch(500, { code: 'internal' });
    await expect(getSitemap('smilecare')).rejects.toThrow(
      'Public API request publicSitemap answered HTTP 500',
    );
  });
});

describe('getCachedSitemap', () => {
  it('is tagged by site, for robots.txt', async () => {
    const sitemap: SitemapResponse = { origin: 'http://smilecare.localhost:3101', entries: [] };
    stubFetch(200, sitemap);
    await expect(getCachedSitemap('smilecare')).resolves.toEqual(sitemap);
    expect(cacheTag).toHaveBeenCalledWith('site:smilecare');
    expect(cacheLife).toHaveBeenCalledWith(SITE_CACHE_LIFE);
  });

  it('keeps an API error out of the cache and throws it outside', async () => {
    stubFetch(500, { code: 'internal' });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(getCachedSitemap('smilecare')).rejects.toThrow(
      'Public API lookup publicSitemap failed',
    );
    expect(cacheLife).toHaveBeenCalledWith({ stale: 0, revalidate: 0, expire: 0 });
  });
});

describe('getPreview', () => {
  it('is never cached or tagged', async () => {
    const fetchMock = stubFetch(200, {
      data: pageData,
      preview: { kind: 'draft', version: null, expiresAt: '2026-10-31T08:00:00.000Z' },
    });
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    await expect(getPreview('a.b.c')).resolves.toMatchObject({
      preview: { kind: 'draft' },
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://api.test/public/preview/a.b.c');
    expect(fetchMock.mock.calls[0]?.[1]?.cache).toBe('no-store');
    expect(timeout).toHaveBeenCalledWith(LOOKUP_TIMEOUT_MS);
    expect(cacheTag).not.toHaveBeenCalled();
    expect(cacheLife).not.toHaveBeenCalled();
  });

  it('returns null for an invalid or expired token', async () => {
    stubFetch(404, { code: 'not_found' });
    await expect(getPreview('expired.token.x')).resolves.toBeNull();
  });
});

describe('getPreviewStatus', () => {
  it('asks the light status endpoint within the check timeout, never cached', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const fetchMock = stubFetch(200, { kind: 'draft', subdomain: 'smilecare' });
    await expect(getPreviewStatus('a.b.c')).resolves.toEqual({
      kind: 'draft',
      subdomain: 'smilecare',
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://api.test/public/preview/a.b.c/status');
    expect(fetchMock.mock.calls[0]?.[1]?.cache).toBe('no-store');
    expect(timeout).toHaveBeenCalledWith(CHECK_TIMEOUT_MS);
    expect(cacheTag).not.toHaveBeenCalled();
  });

  it('returns null for an invalid, expired or foreign token, and throws when the API fails', async () => {
    stubFetch(404, { code: 'not_found' });
    await expect(getPreviewStatus('expired.token.x')).resolves.toBeNull();
    stubFetch(500, { code: 'internal' });
    await expect(getPreviewStatus('a.b.c')).rejects.toThrow();
  });
});
