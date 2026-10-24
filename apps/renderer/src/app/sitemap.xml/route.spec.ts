import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSitemap } from '../../lib/public-api';
import { GET as getRobots } from '../robots.txt/route';
import { GET as getSitemapXml } from './route';

vi.mock('../../lib/public-api', () => ({ getSitemap: vi.fn() }));

const SITEMAP = {
  origin: 'http://smilecare.localhost:3101',
  entries: [{ path: '', lastModified: '2026-10-24T08:00:00.000Z' }],
};

function request(path: string, host: string): Request {
  return new Request(`http://${host}${path}`, { headers: { host } });
}

beforeEach(() => {
  vi.stubEnv('API_PUBLIC_URL', 'http://api.test');
  vi.stubEnv('BASE_DOMAIN', 'localhost:3101');
  vi.stubEnv('PUBLIC_SITE_PROTOCOL', 'http');
  vi.stubEnv('REVALIDATE_SECRET', 's'.repeat(32));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
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
