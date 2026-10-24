import { rendererEnv } from '../../env';
import { subdomainFromHeaders } from '../../lib/host';
import { getSitemap } from '../../lib/public-api';
import { notFoundText } from '../../lib/responses';
import { sitemapXml } from '../../lib/seo-files';

/** Sitemap of the site addressed by the host; same 404 for unknown hosts and unknown sites. */
export async function GET(request: Request): Promise<Response> {
  const subdomain = subdomainFromHeaders(request.headers, rendererEnv());
  const sitemap = subdomain === null ? null : await getSitemap(subdomain);
  if (sitemap === null) {
    return notFoundText();
  }
  return new Response(sitemapXml(sitemap), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
