import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Integration tests run against the MongoDB replica set from docker compose (pnpm infra:up).
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.int.spec.ts'],
    setupFiles: ['test/load-env.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
