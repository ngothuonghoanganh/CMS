import type { SitemapResponse } from '@plp/contracts';
import { rendererEnv } from '../env';
import { getHostSite } from './public-api';
import { subdomainForRequest } from './request-site';
import { notFoundText, unavailableText } from './responses';

/**
 * Answers an SEO file of the site addressed by the host from a sitemap lookup (live for the
 * sitemap, cached for robots.txt): the same 404 for unknown hosts and unknown sites, and a 503 with
 * `Retry-After` when the API cannot answer. A 404 for robots.txt would let crawlers fetch
 * everything; a 500 without a retry hint would leave them guessing (ADR-009, ADR-011).
 */
export async function answerWithSitemap(
  request: Request,
  lookup: (subdomain: string) => Promise<SitemapResponse | null>,
  render: (sitemap: SitemapResponse) => Response,
): Promise<Response> {
  let sitemap: SitemapResponse | null;
  try {
    const subdomain = await subdomainForRequest(request.headers, rendererEnv(), getHostSite);
    if (subdomain === null) {
      return notFoundText();
    }
    sitemap = await lookup(subdomain);
  } catch (error) {
    console.error('Sitemap lookup failed; answering 503', error);
    return unavailableText();
  }
  return sitemap === null ? notFoundText() : render(sitemap);
}
