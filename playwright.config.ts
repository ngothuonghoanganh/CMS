import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command:
        'INTEGRATION_EMAIL_PROVIDER=fake INTEGRATION_ALLOW_HTTP_WEBHOOKS=true INTEGRATION_ALLOW_LOCAL_WEBHOOKS=true pnpm --filter @payload/api dev',
      url: 'http://127.0.0.1:3001/api/v1/health/live',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @payload/cms dev',
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @payload/renderer dev',
      url: 'http://127.0.0.1:3002',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
