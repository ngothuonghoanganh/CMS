import { defineConfig, devices } from '@playwright/test';

const apiPort = Number(process.env.E2E_API_PORT ?? 3001);
const cmsPort = Number(process.env.E2E_CMS_PORT ?? 3000);
const rendererPort = Number(process.env.E2E_RENDERER_PORT ?? 3002);
const apiOrigin = `http://127.0.0.1:${apiPort}`;
const cmsOrigin = `http://127.0.0.1:${cmsPort}`;
const rendererOrigin = `http://127.0.0.1:${rendererPort}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // The local suite starts three dev servers. Keep the default worker count
  // bounded so route compilation does not take those servers offline during
  // a full E2E run.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: cmsOrigin,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command: `PORT=${apiPort} CORS_ORIGIN=${cmsOrigin},http://localhost:${cmsPort},${rendererOrigin},http://localhost:${rendererPort} PUBLIC_PLATFORM_ORIGIN=${rendererOrigin} INTEGRATION_EMAIL_PROVIDER=fake INTEGRATION_ALLOW_HTTP_WEBHOOKS=true INTEGRATION_ALLOW_LOCAL_WEBHOOKS=true DOMAIN_VERIFICATION_PROVIDER=fake TRUST_PROXY=true pnpm --filter @payload/api dev`,
      url: `${apiOrigin}/api/v1/health/live`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `NEXT_PUBLIC_API_BASE_URL=${apiOrigin}/api/v1 NEXT_PUBLIC_RENDERER_BASE_URL=${rendererOrigin} pnpm --filter @payload/cms exec next dev --turbopack -p ${cmsPort}`,
      url: cmsOrigin,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // Next 16's Turbopack dev HMR currently panics while rewriting this
      // optional catch-all route; production builds still use Turbopack.
      command: `RENDERER_API_BASE_URL=${apiOrigin}/api/v1 TRUST_PROXY=true pnpm --filter @payload/renderer exec next dev --webpack -p ${rendererPort}`,
      url: rendererOrigin,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
