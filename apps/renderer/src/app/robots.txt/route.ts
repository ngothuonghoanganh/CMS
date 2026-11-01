import { robotsTxt } from '../../lib/seo-files';
import { getCachedSitemap } from '../../lib/public-api';
import { answerWithSitemap } from '../../lib/sitemap-route';

/**
 * robots.txt of the site addressed by the host. The cached sitemap lookup tells whether the site
 * exists and gives its origin; the site's tag refreshes it when the primary address changes.
 */
export function GET(request: Request): Promise<Response> {
  return answerWithSitemap(
    request,
    getCachedSitemap,
    (sitemap) =>
      new Response(robotsTxt(sitemap.origin), {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      }),
  );
}
