import type { EnvInput } from '../src/config/env.js';

export const TEST_ADMIN_ORIGIN = 'http://localhost:3100';
export const TEST_RENDERER_API_SECRET = 'test-renderer-api-secret-0123456789abcdef';

/** Environment for integration tests; MONGODB_URI is set per test file by createTestApp. */
export function testEnvInput(
  overrides: Partial<EnvInput> = {},
): Record<string, string | undefined> {
  const base: Record<string, string> = {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    ADMIN_ORIGIN: TEST_ADMIN_ORIGIN,
    COOKIE_SECURE: 'false',
    AUTH_RATE_LIMIT_PER_MINUTE: '1000',
    PUBLIC_SITE_ORIGIN_TEMPLATE: 'http://{subdomain}.localhost:3101',
    RENDERER_INTERNAL_URL: 'http://localhost:3101',
    REVALIDATE_SECRET: 'test-revalidate-secret-0123456789abcdef',
    PREVIEW_SECRET: 'test-preview-secret-0123456789abcdef',
    RENDERER_API_SECRET: TEST_RENDERER_API_SECRET,
    S3_ENDPOINT: process.env['S3_ENDPOINT'] ?? 'http://localhost:9100',
    S3_REGION: process.env['S3_REGION'] ?? 'us-east-1',
    S3_BUCKET: process.env['S3_BUCKET'] ?? 'plp-assets',
    S3_ACCESS_KEY_ID: process.env['S3_ACCESS_KEY_ID'] ?? 'plp-dev-access',
    S3_SECRET_ACCESS_KEY: process.env['S3_SECRET_ACCESS_KEY'] ?? 'plp-dev-secret',
    S3_PUBLIC_BASE_URL: process.env['S3_PUBLIC_BASE_URL'] ?? 'http://localhost:9100/plp-assets',
  };
  const merged: Record<string, string | undefined> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    merged[key] =
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : undefined;
  }
  return merged;
}
