import { describe, expect, it } from 'vitest';
import { parseAdminEnv } from './env';

describe('parseAdminEnv', () => {
  it('accepts the internal API URL', () => {
    expect(parseAdminEnv({ API_INTERNAL_URL: 'http://localhost:4100' })).toEqual({
      API_INTERNAL_URL: 'http://localhost:4100',
    });
  });

  it('fails fast when the API URL is missing', () => {
    expect(() => parseAdminEnv({})).toThrow(/API_INTERNAL_URL/);
  });
});
