import { describe, expect, it } from 'vitest';
import { parseAdminEnv } from './env';

const valid = {
  API_INTERNAL_URL: 'http://localhost:4100',
  PUBLIC_SITE_ORIGIN_TEMPLATE: 'http://{subdomain}.localhost:3101',
};

describe('parseAdminEnv', () => {
  it('accepts the internal API URL and the site origin template', () => {
    expect(parseAdminEnv(valid)).toEqual(valid);
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
