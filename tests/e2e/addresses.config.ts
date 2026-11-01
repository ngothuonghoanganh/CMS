import { defineConfig, devices } from '@playwright/test';
import { COMMON_ORIGIN, WORKSPACE_ORIGIN_TEMPLATE } from './addresses/origins.js';
import { urls } from './urls.js';

/**
 * Workspace addresses (ADR-025): an API and an admin that open every workspace at
 * `{slug}.app.e2e.test`, with the common address at `app.e2e.test`. Chromium sends these names to
 * this machine, as it does for the custom domains of the main suite. Runs after
 * `playwright.config.ts` (`pnpm test:e2e`), on the same ports and a database of its own.
 */
const repoRoot = '../..';
const addressEnv = {
  ADMIN_ORIGIN: COMMON_ORIGIN,
  ADMIN_WORKSPACE_ORIGIN_TEMPLATE: WORKSPACE_ORIGIN_TEMPLATE,
};

export default defineConfig({
  testDir: './addresses',
  forbidOnly: Boolean(process.env['CI']),
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: COMMON_ORIGIN,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
        launchOptions: { args: ['--host-resolver-rules=MAP *.e2e.test 127.0.0.1'] },
      },
    },
  ],
  webServer: [
    {
      // Each run starts from an empty database: one per workspace accumulates otherwise (ADR-025).
      command: 'pnpm --filter @plp/api db:drop-test && pnpm --filter @plp/api start',
      cwd: repoRoot,
      env: {
        ...addressEnv,
        MONGODB_URI: 'mongodb://localhost:27117/plp_e2e_addresses?replicaSet=rs0',
        SESSION_COOKIE_DOMAIN: new URL(COMMON_ORIGIN).hostname,
        AUTH_RATE_LIMIT_PER_MINUTE: '1000',
      },
      url: `${urls.api}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @plp/admin start',
      cwd: repoRoot,
      env: addressEnv,
      url: `${urls.admin}/healthz`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
