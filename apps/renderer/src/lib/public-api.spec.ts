import type { PublicPageData, ResolveResponse, SitemapResponse } from '@plp/contracts';
import { cacheLife, cacheTag } from 'next/cache';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPreview, getResolved, getSitemap, SITE_CACHE_LIFE } from './public-api';

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
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
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

  it('throws on other API errors instead of caching them', async () => {
    stubFetch(503, { code: 'internal' });
    await expect(getResolved('smilecare', '', RELEASE_ID)).rejects.toThrow('HTTP 503');
  });
});

describe('getSitemap', () => {
  it('is tagged by site and returns null for an unknown site', async () => {
    const sitemap: SitemapResponse = {
      origin: 'http://smilecare.localhost:3101',
      entries: [{ path: '/', lastModified: '2026-10-24T08:00:00.000Z' }],
    };
    const fetchMock = stubFetch(200, sitemap);
    await expect(getSitemap('smilecare')).resolves.toEqual(sitemap);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://api.test/public/sites/smilecare/sitemap');
    expect(cacheTag).toHaveBeenCalledWith('site:smilecare');
    expect(cacheLife).toHaveBeenCalledWith(SITE_CACHE_LIFE);

    stubFetch(404, { code: 'not_found' });
    await expect(getSitemap('khong-co')).resolves.toBeNull();
  });
});

describe('getPreview', () => {
  it('is never cached or tagged', async () => {
    const fetchMock = stubFetch(200, {
      data: pageData,
      preview: { kind: 'draft', version: null, expiresAt: '2026-10-31T08:00:00.000Z' },
    });
    await expect(getPreview('a.b.c')).resolves.toMatchObject({ preview: { kind: 'draft' } });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://api.test/public/preview/a.b.c');
    expect(fetchMock.mock.calls[0]?.[1]?.cache).toBe('no-store');
    expect(cacheTag).not.toHaveBeenCalled();
    expect(cacheLife).not.toHaveBeenCalled();
  });

  it('returns null for an invalid or expired token', async () => {
    stubFetch(404, { code: 'not_found' });
    await expect(getPreview('expired.token.x')).resolves.toBeNull();
  });
});
