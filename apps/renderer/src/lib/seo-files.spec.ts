import { describe, expect, it } from 'vitest';
import { robotsTxt, sitemapXml } from './seo-files';

describe('sitemapXml', () => {
  it('lists every entry with an absolute location and lastmod', () => {
    const xml = sitemapXml({
      origin: 'https://smilecare.payload.site/',
      entries: [
        { path: '/', lastModified: '2026-10-20T08:00:00.000Z' },
        { path: '/uu-dai', lastModified: '2026-10-24T09:30:00.000Z' },
        { path: '/nieng-rang', lastModified: '2026-10-22T10:00:00.000Z' },
      ],
    });
    expect(xml).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        '  <url>\n    <loc>https://smilecare.payload.site/</loc>\n' +
        '    <lastmod>2026-10-20T08:00:00.000Z</lastmod>\n  </url>\n' +
        '  <url>\n    <loc>https://smilecare.payload.site/uu-dai</loc>\n' +
        '    <lastmod>2026-10-24T09:30:00.000Z</lastmod>\n  </url>\n' +
        '  <url>\n    <loc>https://smilecare.payload.site/nieng-rang</loc>\n' +
        '    <lastmod>2026-10-22T10:00:00.000Z</lastmod>\n  </url>\n' +
        '</urlset>\n',
    );
  });

  it('produces an empty urlset when nothing is live', () => {
    expect(sitemapXml({ origin: 'https://smilecare.payload.site/', entries: [] })).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        '</urlset>\n',
    );
  });

  it('escapes XML special characters', () => {
    const xml = sitemapXml({
      origin: 'https://a.payload.site',
      entries: [{ path: '/x&y<z>', lastModified: '2026-10-24T09:30:00.000Z' }],
    });
    expect(xml).toContain('<loc>https://a.payload.site/x&amp;y&lt;z&gt;</loc>');
  });
});

describe('robotsTxt', () => {
  it('allows everything and points at the sitemap of the same origin', () => {
    expect(robotsTxt('https://smilecare.payload.site')).toBe(
      'User-agent: *\nAllow: /\n\nSitemap: https://smilecare.payload.site/sitemap.xml\n',
    );
    expect(robotsTxt('http://smilecare.localhost:3101/')).toContain(
      'Sitemap: http://smilecare.localhost:3101/sitemap.xml',
    );
  });
});
