import { describe, expect, it } from 'vitest';
import { parseAdminEnv } from './env';

const valid = {
  API_INTERNAL_URL: 'http://localhost:4100',
  PUBLIC_SITE_ORIGIN_TEMPLATE: 'http://{subdomain}.localhost:3101',
};

describe('parseAdminEnv', () => {
  it('accepts the internal API URL and the site origin template', () => {
    expect(parseAdminEnv(valid)).toEqual({ ...valid, COOKIE_SECURE: true });
  });

  it('assumes HTTPS, as the API does, unless cookies are explicitly not secure', () => {
    expect(parseAdminEnv({ ...valid, COOKIE_SECURE: 'false' }).COOKIE_SECURE).toBe(false);
    expect(parseAdminEnv({ ...valid, COOKIE_SECURE: 'true' }).COOKIE_SECURE).toBe(true);
    expect(() => parseAdminEnv({ ...valid, COOKIE_SECURE: 'yes' })).toThrow(/COOKIE_SECURE/);
  });

  it('fails fast when the API URL is missing', () => {
    expect(() =>
      parseAdminEnv({ PUBLIC_SITE_ORIGIN_TEMPLATE: valid.PUBLIC_SITE_ORIGIN_TEMPLATE }),
    ).toThrow(/API_INTERNAL_URL/);
  });

  it('requires the {subdomain} placeholder', () => {
    expect(() =>
      parseAdminEnv({ ...valid, PUBLIC_SITE_ORIGIN_TEMPLATE: 'http://localhost:3101' }),
    ).toThrow(/PUBLIC_SITE_ORIGIN_TEMPLATE/);
  });
});
