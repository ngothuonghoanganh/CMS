import { defineConfig, devices } from '@playwright/test';
import { urls } from './urls.js';

/**
 * The design capture tool (`pnpm --filter @plp/e2e visual:capture`, ARCHITECTURE §5): seeds the
 * boards' sample data through the API into a database of its own, then captures every
 * implemented screen at its board's size into `visual-captures/` (gitignored), to compare by eye
 * with the boards of `docs/design/plp-ux-v1/screens`. It is not a test gate: the boards need the
 * design artifact's runtime to render, and pixels differ between operating systems.
 *
 * Runs against production builds (`pnpm build`) and the docker compose infrastructure, on the
 * E2E ports: stop `pnpm test:e2e` and dev servers first.
 */
const repoRoot = '../..';

export default defineConfig({
  testDir: './visual',
  outputDir: './test-results/visual',
  workers: 1,
  timeout: 300_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: urls.admin,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    actionTimeout: 15_000,
    // The boards are drawn at 1x; the captures compare at the same scale.
    deviceScaleFactor: 1,
  },
  webServer: [
    {
      // Each run starts from an empty database: one per workspace accumulates otherwise (ADR-025).
      command: 'pnpm --filter @plp/api db:drop-test && pnpm --filter @plp/api start',
      cwd: repoRoot,
      env: {
        MONGODB_URI: 'mongodb://localhost:27117/plp_visual?replicaSet=rs0',
        AUTH_RATE_LIMIT_PER_MINUTE: '1000',
        LEAD_LIMIT_PER_CLIENT: '100',
        // Boards 20 and 21 (ADR-031): the fake AI's fixed copy, never a real service.
        AI_PROVIDER: 'fake',
      },
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
