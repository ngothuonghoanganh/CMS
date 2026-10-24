import { rendererEnv } from '../../env';
import { subdomainFromHeaders } from '../../lib/host';
import { getSitemap } from '../../lib/public-api';
import { notFoundText } from '../../lib/responses';
import { robotsTxt } from '../../lib/seo-files';

/**
 * robots.txt of the site addressed by the host. The cached sitemap lookup tells whether the site
 * exists and gives its origin, so a publish refreshes this file too.
 */
export async function GET(request: Request): Promise<Response> {
  const subdomain = subdomainFromHeaders(request.headers, rendererEnv());
  const sitemap = subdomain === null ? null : await getSitemap(subdomain);
  if (sitemap === null) {
    return notFoundText();
  }
  return new Response(robotsTxt(sitemap.origin), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
