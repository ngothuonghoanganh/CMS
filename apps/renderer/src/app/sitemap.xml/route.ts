import { sitemapXml } from '../../lib/seo-files';
import { answerWithSitemap } from '../../lib/sitemap-route';

/** Sitemap of the site addressed by the host; same 404 for unknown hosts and unknown sites. */
export function GET(request: Request): Promise<Response> {
  return answerWithSitemap(
    request,
    (sitemap) =>
      new Response(sitemapXml(sitemap), {
        headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      }),
  );
}
