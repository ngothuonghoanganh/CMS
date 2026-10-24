import {
  endpoints,
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
 */
export async function getResolved(
  subdomain: string,
  path: string,
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
