import { defineConfig, devices } from '@playwright/test';
import { urls } from './urls.js';

/**
 * `pnpm --filter @plp/e2e seed:dev`: seeds the boards' sample data ("Nha khoa Smile Care" of
 * workspace "Mây Xanh Agency": pages in every state, leads, views, data requests) into the
 * development database of `.env`, and prints the account to sign in with. Not a test gate.
 *
 * Runs the production builds (`pnpm build`) on the dev ports, so stop `pnpm dev` first. The API
 * gets the E2E limits: the board sends more leads from one client than the default allows
 * (ADR-016). Each run adds a new account and workspace; nothing existing is touched.
 */
const repoRoot = '../..';

export default defineConfig({
  testDir: './seed-dev',
  outputDir: './test-results/seed-dev',
  workers: 1,
  timeout: 300_000,
  reporter: 'list',
  use: { ...devices['Desktop Chrome'], baseURL: urls.admin, locale: 'vi-VN' },
  webServer: [
    {
      command: 'pnpm --filter @plp/api start',
      cwd: repoRoot,
      env: { AUTH_RATE_LIMIT_PER_MINUTE: '1000', LEAD_LIMIT_PER_CLIENT: '100' },
      url: `${urls.api}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @plp/admin start',
      cwd: repoRoot,
      url: `${urls.admin}/healthz`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @plp/renderer start',
      cwd: repoRoot,
      url: `${urls.renderer}/healthz`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
