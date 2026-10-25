import {
  endpoints,
  type PathStatusResponse,
  type PublicPreviewResponse,
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
 * Release of the page at `path` ("" is the home page) on a site, or a redirect. Null means
 * "nothing there" and is cached under the site tag too, so a page that goes live later appears as
 * soon as the publish revalidates the site.
 *
 * `_liveReleaseId` is not sent to the API: `'use cache'` keys the entry by every argument, and
 * this one only exists for that. The proxy reads it from the uncached path status ('' when
 * unknown), so once the pointer moves the next request cannot reuse the previous release,
 * whenever the tag revalidation lands (ADR-009).
 */
export async function getResolved(
  subdomain: string,
  path: string,
  _liveReleaseId: string,
): Promise<ResolveResponse | null> {
  'use cache';
  cacheTag(siteCacheTag(subdomain));
  cacheLife(SITE_CACHE_LIFE);
  const endpoint = endpoints.publicResolve;
  return fetchPublicJson({
    baseUrl: rendererEnv().API_PUBLIC_URL,
    path: endpoint.path(subdomain),
    query: { path },
    schema: endpoint.response,
    label: 'publicResolve',
  });
}

/**
 * Whether a live page or a redirect answers at `path` ("" is the home page); null when nothing
 * does. Asked by the proxy on every page request, so it is a light lookup and never cached: the
 * page itself still renders from the cached `getResolved`.
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
    cache: 'no-store',
  });
}

/** Live, indexable pages of a site; null when the site does not exist. */
export async function getSitemap(subdomain: string): Promise<SitemapResponse | null> {
  'use cache';
  cacheTag(siteCacheTag(subdomain));
  cacheLife(SITE_CACHE_LIFE);
  const endpoint = endpoints.publicSitemap;
  return fetchPublicJson({
    baseUrl: rendererEnv().API_PUBLIC_URL,
    path: endpoint.path(subdomain),
    schema: endpoint.response,
    label: 'publicSitemap',
  });
}

/**
 * The page behind a signed preview token; null when the token is invalid or expired. Never
 * cached: a draft preview always shows the latest draft (ADR-010).
 */
export async function getPreview(token: string): Promise<PublicPreviewResponse | null> {
  const endpoint = endpoints.publicPreview;
  return fetchPublicJson({
    baseUrl: rendererEnv().API_PUBLIC_URL,
    path: endpoint.path(token),
    schema: endpoint.response,
    label: 'publicPreview',
    cache: 'no-store',
  });
}
