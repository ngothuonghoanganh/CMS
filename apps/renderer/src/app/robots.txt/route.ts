import { robotsTxt } from '../../lib/seo-files';
import { answerWithSitemap } from '../../lib/sitemap-route';

/**
 * robots.txt of the site addressed by the host. The cached sitemap lookup tells whether the site
 * exists and gives its origin, so a publish refreshes this file too.
 */
export function GET(request: Request): Promise<Response> {
  return answerWithSitemap(
    request,
    (sitemap) =>
      new Response(robotsTxt(sitemap.origin), {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      }),
  );
}
