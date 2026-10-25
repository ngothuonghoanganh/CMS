import type { SitemapResponse } from '@plp/contracts';

const XML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => XML_ESCAPES[character] ?? character);
}

function trimOrigin(origin: string): string {
  return origin.replace(/\/+$/, '');
}

/** Absolute URL of a sitemap path; the API sends it with a leading slash ("/", "/uu-dai"). */
function pageUrl(origin: string, path: string): string {
  return `${trimOrigin(origin)}${path}`;
}

/** XML sitemap (sitemaps.org 0.9) of the site's live, indexable pages. */
export function sitemapXml(sitemap: SitemapResponse): string {
  const urls = sitemap.entries.map(
    (entry) =>
      `  <url>\n    <loc>${escapeXml(pageUrl(sitemap.origin, entry.path))}</loc>\n` +
      `    <lastmod>${escapeXml(entry.lastModified)}</lastmod>\n  </url>\n`,
  );
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join('') +
    '</urlset>\n'
  );
}

/** robots.txt of a site: everything may be crawled; noindex pages carry their own meta tag. */
export function robotsTxt(origin: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${trimOrigin(origin)}/sitemap.xml\n`;
}
