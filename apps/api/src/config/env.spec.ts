import { describe, expect, it } from 'vitest';
import { baseDomainOf, customDomainOrigin, parseEnv, siteOrigin, tlsCheckEnabled } from './env.js';

const valid = {
  MONGODB_URI: 'mongodb://localhost:27117/plp',
  ADMIN_ORIGIN: 'http://localhost:3100',
  PUBLIC_SITE_ORIGIN_TEMPLATE: 'http://{subdomain}.localhost:3101',
  RENDERER_INTERNAL_URL: 'http://localhost:3101',
  REVALIDATE_SECRET: 'r'.repeat(32),
  PREVIEW_SECRET: 'p'.repeat(32),
  LOGIN_ATTEMPT_SECRET: 'l'.repeat(32),
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
    expect(() => parseEnv({ ...valid, LOGIN_ATTEMPT_SECRET: 'short' })).toThrow(
      /LOGIN_ATTEMPT_SECRET/,
    );
  });

  it('needs a secret for the login attempt keys, which has no default (ADR-004)', () => {
    const { LOGIN_ATTEMPT_SECRET: _missing, ...rest } = valid;
    expect(() => parseEnv(rest)).toThrow(/LOGIN_ATTEMPT_SECRET/);
  });

  it('requires the {subdomain} placeholder in the public origin template', () => {
    expect(() =>
      parseEnv({ ...valid, PUBLIC_SITE_ORIGIN_TEMPLATE: 'http://localhost:3101' }),
    ).toThrow(/PUBLIC_SITE_ORIGIN_TEMPLATE/);
  });

  it('builds a site origin from the template', () => {
    expect(siteOrigin(parseEnv(valid), 'smilecare')).toBe('http://smilecare.localhost:3101');
  });

  it('configures custom domains, HTTPS checks on only in production by default (ADR-022)', () => {
    const env = parseEnv({ ...valid, CUSTOM_DOMAIN_IPV4: '203.0.113.10, 203.0.113.11' });
    expect(env.CUSTOM_DOMAIN_CNAME_TARGET).toBe('cname.payload.site');
    expect(env.CUSTOM_DOMAIN_IPV4).toEqual(['203.0.113.10', '203.0.113.11']);
    expect(env.DOMAIN_MONITOR_INTERVAL_MS).toBe(60_000);
    expect(customDomainOrigin(env, 'go.smilecare.vn')).toBe('https://go.smilecare.vn');
    expect(baseDomainOf(env)).toBe('localhost:3101'.split(':')[0]);
    expect(tlsCheckEnabled(env)).toBe(false);
    const edge = { CUSTOM_DOMAIN_IPV4: '203.0.113.10' };
    expect(tlsCheckEnabled(parseEnv({ ...valid, ...edge, NODE_ENV: 'production' }))).toBe(true);
    expect(tlsCheckEnabled(parseEnv({ ...valid, ...edge, DOMAIN_TLS_CHECK: 'on' }))).toBe(true);
    // The HTTPS check connects to the edge, never to where a customer's DNS points.
    expect(() => parseEnv({ ...valid, NODE_ENV: 'production' })).toThrow(/CUSTOM_DOMAIN_IPV4/);
    expect(() => parseEnv({ ...valid, DOMAIN_TLS_CHECK: 'on' })).toThrow(/CUSTOM_DOMAIN_IPV4/);
    expect(() => parseEnv({ ...valid, CUSTOM_DOMAIN_IPV4: 'not-an-ip' })).toThrow(
      /CUSTOM_DOMAIN_IPV4/,
    );
  });

  it('answers DNS from a file only outside production', () => {
    expect(
      parseEnv({ ...valid, DOMAIN_DNS_ZONE_FILE: '/tmp/zone.json' }).DOMAIN_DNS_ZONE_FILE,
    ).toBe('/tmp/zone.json');
    expect(() =>
      parseEnv({ ...valid, NODE_ENV: 'production', DOMAIN_DNS_ZONE_FILE: '/tmp/zone.json' }),
    ).toThrow(/DOMAIN_DNS_ZONE_FILE/);
  });
});
