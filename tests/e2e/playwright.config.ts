import { defineConfig, devices } from '@playwright/test';
import { urls } from './urls.js';

// Runs against production builds (`pnpm build`) and the docker compose infrastructure (`pnpm infra:up`).
const isCI = Boolean(process.env['CI']);
const repoRoot = '../..';

export default defineConfig({
  testDir: './specs',
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: 1,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: urls.admin,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @plp/api start',
      cwd: repoRoot,
      url: `${urls.api}/health`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @plp/admin start',
      cwd: repoRoot,
      url: `${urls.admin}/healthz`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @plp/renderer start',
      cwd: repoRoot,
      url: `${urls.renderer}/healthz`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
  ],
});
