import { describe, expect, it } from 'vitest';
import { parseEnv, siteOrigin } from './env.js';

const valid = {
  MONGODB_URI: 'mongodb://localhost:27117/plp',
  ADMIN_ORIGIN: 'http://localhost:3100',
  PUBLIC_SITE_ORIGIN_TEMPLATE: 'http://{subdomain}.localhost:3101',
  RENDERER_INTERNAL_URL: 'http://localhost:3101',
  REVALIDATE_SECRET: 'r'.repeat(32),
  PREVIEW_SECRET: 'p'.repeat(32),
  RENDERER_API_SECRET: 'r'.repeat(32),
  SMTP_URL: 'smtp://localhost:1125',
  LEAD_EMAIL_FROM: 'Payload Landing Page <no-reply@payload.site>',
  S3_ENDPOINT: 'http://localhost:9100',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'plp-assets',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
  S3_PUBLIC_BASE_URL: 'http://localhost:9100/plp-assets',
};

describe('parseEnv', () => {
  it('applies defaults for optional settings', () => {
    const env = parseEnv(valid);
    expect(env.API_PORT).toBe(4100);
    expect(env.SESSION_TTL_DAYS).toBe(30);
    expect(env.COOKIE_SECURE).toBe(true);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.TRUST_PROXY_HOPS).toBe(0);
    // ADR-016: 5 leads per visitor in 10 minutes, 300 per site per hour.
    expect(env.LEAD_LIMIT_PER_CLIENT).toBe(5);
    expect(env.LEAD_LIMIT_PER_CLIENT_WINDOW_MINUTES).toBe(10);
    expect(env.LEAD_LIMIT_PER_SITE_PER_HOUR).toBe(300);
    // ADR-019: 60 views per visitor in 10 minutes, 20,000 per site per hour.
    expect(env.PAGE_VIEW_LIMIT_PER_CLIENT).toBe(60);
    expect(env.PAGE_VIEW_LIMIT_PER_CLIENT_WINDOW_MINUTES).toBe(10);
    expect(env.PAGE_VIEW_LIMIT_PER_SITE_PER_HOUR).toBe(20_000);
  });

  it('fails fast with the name of a missing variable', () => {
    const { MONGODB_URI: _missing, ...rest } = valid;
    expect(() => parseEnv(rest)).toThrow(/MONGODB_URI/);
  });

  it('needs an SMTP server for lead emails, smtp or smtps only (ADR-018)', () => {
    const { SMTP_URL: _missing, ...rest } = valid;
    expect(() => parseEnv(rest)).toThrow(/SMTP_URL/);
    expect(() => parseEnv({ ...valid, SMTP_URL: 'http://localhost:1125' })).toThrow(/SMTP_URL/);
    expect(
      parseEnv({ ...valid, SMTP_URL: 'smtps://user:pass@smtp.example.com:465' }).SMTP_URL,
    ).toBe('smtps://user:pass@smtp.example.com:465');
  });

  it('rejects short secrets', () => {
    expect(() => parseEnv({ ...valid, PREVIEW_SECRET: 'short' })).toThrow(/PREVIEW_SECRET/);
    expect(() => parseEnv({ ...valid, RENDERER_API_SECRET: 'short' })).toThrow(
      /RENDERER_API_SECRET/,
    );
  });

  it('requires the {subdomain} placeholder in the public origin template', () => {
    expect(() =>
      parseEnv({ ...valid, PUBLIC_SITE_ORIGIN_TEMPLATE: 'http://localhost:3101' }),
    ).toThrow(/PUBLIC_SITE_ORIGIN_TEMPLATE/);
  });

  it('builds a site origin from the template', () => {
    expect(siteOrigin(parseEnv(valid), 'smilecare')).toBe('http://smilecare.localhost:3101');
  });
});
