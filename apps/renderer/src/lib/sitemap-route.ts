import type { SitemapResponse } from '@plp/contracts';
import { rendererEnv } from '../env';
import { subdomainFromHeaders } from './host';
import { getSitemap } from './public-api';
import { notFoundText, unavailableText } from './responses';

/**
 * Answers an SEO file of the site addressed by the host from its cached sitemap lookup: the same
 * 404 for unknown hosts and unknown sites, and a 503 with `Retry-After` when the API cannot answer.
 * A 404 for robots.txt would let crawlers fetch everything; a 500 without a retry hint would
 * leave them guessing (ADR-009, ADR-011).
 */
export async function answerWithSitemap(
  request: Request,
  render: (sitemap: SitemapResponse) => Response,
): Promise<Response> {
  const subdomain = subdomainFromHeaders(request.headers, rendererEnv());
  if (subdomain === null) {
    return notFoundText();
  }
  let sitemap: SitemapResponse | null;
  try {
    sitemap = await getSitemap(subdomain);
  } catch (error) {
    console.error('Sitemap lookup failed; answering 503', error);
    return unavailableText();
  }
  return sitemap === null ? notFoundText() : render(sitemap);
}
