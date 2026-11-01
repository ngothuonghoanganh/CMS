import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSitemap } from '../../lib/public-api';
import { GET as getRobots } from '../robots.txt/route';
import { GET as getSitemapXml } from './route';

vi.mock('../../lib/public-api', () => ({ getSitemap: vi.fn() }));

const SITEMAP = {
  origin: 'http://smilecare.localhost:3101',
  entries: [{ path: '/', lastModified: '2026-10-24T08:00:00.000Z' }],
};

function request(path: string, host: string): Request {
  return new Request(`http://${host}${path}`, { headers: { host } });
}

beforeEach(() => {
  vi.stubEnv('API_PUBLIC_URL', 'http://api.test');
  vi.stubEnv('BASE_DOMAIN', 'localhost:3101');
  vi.stubEnv('PUBLIC_SITE_PROTOCOL', 'http');
  vi.stubEnv('REVALIDATE_SECRET', 's'.repeat(32));
  vi.stubEnv('RENDERER_API_SECRET', 'r'.repeat(32));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('GET /sitemap.xml', () => {
  it('serves the XML sitemap of the site addressed by the host', async () => {
    vi.mocked(getSitemap).mockResolvedValue(SITEMAP);
    const response = await getSitemapXml(request('/sitemap.xml', 'smilecare.localhost:3101'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/xml; charset=utf-8');
    expect(await response.text()).toContain('<loc>http://smilecare.localhost:3101/</loc>');
    expect(getSitemap).toHaveBeenCalledWith('smilecare');
  });

  it('answers 404 for a host that is not a site, without calling the API', async () => {
    const response = await getSitemapXml(request('/sitemap.xml', 'localhost:3101'));
    expect(response.status).toBe(404);
    expect(getSitemap).not.toHaveBeenCalled();
  });

  it('answers the same 404 for an unknown site', async () => {
    vi.mocked(getSitemap).mockResolvedValue(null);
    const unknownSite = await getSitemapXml(request('/sitemap.xml', 'nobody.localhost:3101'));
    const unknownHost = await getSitemapXml(request('/sitemap.xml', 'example.com'));
    expect(unknownSite.status).toBe(404);
    expect(await unknownSite.text()).toBe(await unknownHost.text());
  });
});

describe('GET /robots.txt', () => {
  it('allows crawling and links the sitemap of the same origin', async () => {
    vi.mocked(getSitemap).mockResolvedValue(SITEMAP);
    const response = await getRobots(request('/robots.txt', 'smilecare.localhost:3101'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await response.text()).toBe(
      'User-agent: *\nAllow: /\n\nSitemap: http://smilecare.localhost:3101/sitemap.xml\n',
    );
  });

  it('answers 404 for unknown hosts and unknown sites', async () => {
    expect((await getRobots(request('/robots.txt', 'evil.example'))).status).toBe(404);
    vi.mocked(getSitemap).mockResolvedValue(null);
    expect((await getRobots(request('/robots.txt', 'nobody.localhost:3101'))).status).toBe(404);
  });
});

// A 404 would tell crawlers the file is gone (for robots.txt: that everything may be crawled), an
// error without a retry hint leaves them guessing; the API being down is neither.
describe('SEO files while the API cannot answer', () => {
  it.each([
    ['/sitemap.xml', getSitemapXml],
    ['/robots.txt', getRobots],
  ])('%s answers 503 with Retry-After and logs the cause', async (path, get) => {
    const error = new Error('Public API lookup publicSitemap failed');
    vi.mocked(getSitemap).mockRejectedValue(error);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await get(request(path, 'smilecare.localhost:3101'));
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await response.text()).toBe('Trang tạm thời chưa mở được\n');
    expect(log).toHaveBeenCalledWith('Sitemap lookup failed; answering 503', error);
  });
});
