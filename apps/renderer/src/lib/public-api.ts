import {
  endpoints,
  type PathStatusResponse,
  type PublicPreviewResponse,
  type PublicPreviewStatusResponse,
  type ResolveResponse,
  type SitemapResponse,
  siteCacheTag,
} from '@plp/contracts';
import { cacheLife, cacheTag } from 'next/cache';
import { rendererEnv } from '../env';
import { fetchPublicJson } from './public-fetch';

/**
 * Lifetime of everything cached for a site. Publishing revalidates the site tag at once (ADR-009);
 * `revalidate` is only the safety net when a revalidation webhook is lost.
 */
export const SITE_CACHE_LIFE = { stale: 60, revalidate: 300, expire: 3600 } as const;

/**
 * How long a visitor waits on the API, at most: the proxy's check, then the page's own lookup. A
 * failed check answers 503 at once (see `proxy.ts`), so the two never add up past 8 seconds; the
 * SEO files make one lookup.
 */
export const CHECK_TIMEOUT_MS = 3000;
export const LOOKUP_TIMEOUT_MS = 5000;

/**
 * What a cached lookup holds. A failure is a value with no lifetime, never a thrown error: when a
 * request awaits a `'use cache'` call that throws from two places (metadata and page), Next 16
 * sends the 500 but never ends the body, and the visitor waits forever. The caller throws instead,
 * outside the cache, where the error ends the response.
 */
type CachedLookup<T> = { kind: 'answer'; value: T } | { kind: 'unavailable' };

/** A failed lookup is not kept: the next request asks the API again. */
const UNAVAILABLE_CACHE_LIFE = { stale: 0, revalidate: 0, expire: 0 } as const;

async function lookupForCache<T>(label: string, load: () => Promise<T>): Promise<CachedLookup<T>> {
  try {
    return { kind: 'answer', value: await load() };
  } catch (error) {
    console.error(`Public API lookup ${label} failed; nothing cached`, error);
    return { kind: 'unavailable' };
  }
}

function answerOf<T>(label: string, lookup: CachedLookup<T>): T {
  if (lookup.kind === 'unavailable') {
    throw new Error(`Public API lookup ${label} failed (logged with its cause)`);
  }
  return lookup.value;
}

/**
 * Release of the page at `path` ("" is the home page) on a site, or a redirect. Null means
 * "nothing there" and is cached under the site tag too, so a page that goes live later appears as
 * soon as the publish revalidates the site.
 *
 * `liveReleaseId` is not sent to the API: `'use cache'` keys the entry by every argument, and
 * this one only exists for that. The proxy reads it from the uncached path status ('' when
 * unknown), so once the pointer moves the next request cannot reuse the previous release,
 * whenever the tag revalidation lands (ADR-009).
 */
export async function getResolved(
  subdomain: string,
  path: string,
  liveReleaseId: string,
): Promise<ResolveResponse | null> {
  return answerOf('publicResolve', await cachedResolve(subdomain, path, liveReleaseId));
}

async function cachedResolve(
  subdomain: string,
  path: string,
  _liveReleaseId: string,
): Promise<CachedLookup<ResolveResponse | null>> {
  'use cache';
  cacheTag(siteCacheTag(subdomain));
  const endpoint = endpoints.publicResolve;
  const lookup = await lookupForCache('publicResolve', () =>
    fetchPublicJson({
      baseUrl: rendererEnv().API_PUBLIC_URL,
      path: endpoint.path(subdomain),
      query: { path },
      schema: endpoint.response,
      label: 'publicResolve',
      timeoutMs: LOOKUP_TIMEOUT_MS,
    }),
  );
  cacheLife(lookup.kind === 'answer' ? SITE_CACHE_LIFE : UNAVAILABLE_CACHE_LIFE);
  return lookup;
}

/**
 * Whether a live page or a redirect (and where to) answers at `path` ("" is the home page); null
 * when nothing does. Asked by the proxy on every page request, so it is a light lookup and never
 * cached: the page itself still renders from the cached `getResolved`.
 */
export async function getPathStatus(
  subdomain: string,
  path: string,
): Promise<PathStatusResponse | null> {
  const endpoint = endpoints.publicPathStatus;
  return fetchPublicJson({
    baseUrl: rendererEnv().API_PUBLIC_URL,
    path: endpoint.path(subdomain),
    query: { path },
    schema: endpoint.response,
    label: 'publicPathStatus',
    timeoutMs: CHECK_TIMEOUT_MS,
    cache: 'no-store',
  });
}

/** Live, indexable pages of a site; null when the site does not exist. */
export async function getSitemap(subdomain: string): Promise<SitemapResponse | null> {
  return answerOf('publicSitemap', await cachedSitemap(subdomain));
}

async function cachedSitemap(subdomain: string): Promise<CachedLookup<SitemapResponse | null>> {
  'use cache';
  cacheTag(siteCacheTag(subdomain));
  const endpoint = endpoints.publicSitemap;
  const lookup = await lookupForCache('publicSitemap', () =>
    fetchPublicJson({
      baseUrl: rendererEnv().API_PUBLIC_URL,
      path: endpoint.path(subdomain),
      schema: endpoint.response,
      label: 'publicSitemap',
      timeoutMs: LOOKUP_TIMEOUT_MS,
    }),
  );
  cacheLife(lookup.kind === 'answer' ? SITE_CACHE_LIFE : UNAVAILABLE_CACHE_LIFE);
  return lookup;
}

/**
 * The page behind a signed preview token; null when the token is invalid or expired. Never
 * cached: a draft preview always shows the latest draft (ADR-010). Loaded once, by the page.
 */
export async function getPreview(token: string): Promise<PublicPreviewResponse | null> {
  const endpoint = endpoints.publicPreview;
  return fetchPublicJson({
    baseUrl: rendererEnv().API_PUBLIC_URL,
    path: endpoint.path(token),
    schema: endpoint.response,
    label: 'publicPreview',
    timeoutMs: LOOKUP_TIMEOUT_MS,
    cache: 'no-store',
  });
}

/**
 * What a signed preview token opens (its kind and its site), without any of the page; null when
 * the token is invalid, expired or opens nothing. The proxy's light check before the page renders:
 * the page then makes the one full load (`getPreview`).
 */
export async function getPreviewStatus(token: string): Promise<PublicPreviewStatusResponse | null> {
  const endpoint = endpoints.publicPreviewStatus;
  return fetchPublicJson({
    baseUrl: rendererEnv().API_PUBLIC_URL,
    path: endpoint.path(token),
    schema: endpoint.response,
    label: 'publicPreviewStatus',
    timeoutMs: CHECK_TIMEOUT_MS,
    cache: 'no-store',
  });
}
