import { defineConfig, devices } from '@playwright/test';
import { urls } from './urls.js';

// Runs against production builds (`pnpm build`) and the docker compose infrastructure (`pnpm infra:up`).
const isCI = Boolean(process.env['CI']);
const repoRoot = '../..';

/**
 * The API of an E2E run writes to its own database, never to the development one. The API loads
 * the root `.env` with `process.loadEnvFile`, which keeps values already set in the process, so
 * these win over `.env`. Specs create unique users and subdomains, so runs do not collide.
 */
const apiEnv = {
  MONGODB_URI: 'mongodb://localhost:27117/plp_e2e?replicaSet=rs0',
  // Every spec signs up its own users from one client. The limit itself is covered by the API
  // integration tests; here it would only make the suite depend on how fast it runs.
  AUTH_RATE_LIMIT_PER_MINUTE: '1000',
};

// Servers are never reused: one started outside this config may point at another database. A
// port already in use fails the run with Playwright's "is already used" error; stop that server.
const reuseExistingServer = false;

export default defineConfig({
  testDir: './specs',
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: 1,
  // Whole user journeys: sign-up, editing with autosave, several publishes.
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: urls.admin,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
  },
  // The design boards are drawn at 1440 px wide.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @plp/api start',
      cwd: repoRoot,
      env: apiEnv,
      url: `${urls.api}/health`,
      reuseExistingServer,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @plp/admin start',
      cwd: repoRoot,
      url: `${urls.admin}/healthz`,
      reuseExistingServer,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @plp/renderer start',
      cwd: repoRoot,
      url: `${urls.renderer}/healthz`,
      reuseExistingServer,
      timeout: 120_000,
    },
  ],
});
