import { afterEach, describe, expect, it, vi } from 'vitest';
import { responseHeaderRules } from './http-headers';

// The environment comes from the test, not from the repository's .env file.
vi.mock('@next/env', () => ({ loadEnvConfig: vi.fn() }));

/** next.config.ts as Next loads it, with the environment of one deployment. */
async function loadConfig(cookieSecure: 'true' | 'false') {
  vi.resetModules();
  vi.stubEnv('API_INTERNAL_URL', 'http://localhost:4100');
  vi.stubEnv('PUBLIC_SITE_ORIGIN_TEMPLATE', 'http://{subdomain}.localhost:3101');
  vi.stubEnv('COOKIE_SECURE', cookieSecure);
  return (await import('../next.config')).default;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('next.config', () => {
  it('sends the response headers, with HSTS when cookies are secure (HTTPS)', async () => {
    const config = await loadConfig('true');
    expect(config.poweredByHeader).toBe(false);
    await expect(config.headers?.()).resolves.toEqual(responseHeaderRules({ https: true }));
  });

  it('sends no HSTS to an admin served over plain HTTP', async () => {
    const config = await loadConfig('false');
    await expect(config.headers?.()).resolves.toEqual(responseHeaderRules({ https: false }));
  });
});
