import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

describe('parseEnv', () => {
  it('applies defaults for optional settings', () => {
    expect(parseEnv({ MONGODB_URI: 'mongodb://localhost:27117/plp' })).toEqual({
      NODE_ENV: 'development',
      API_PORT: 4100,
      MONGODB_URI: 'mongodb://localhost:27117/plp',
      LOG_LEVEL: 'info',
    });
  });

  it('fails fast with the name of the missing variable', () => {
    expect(() => parseEnv({})).toThrow(/MONGODB_URI/);
  });

  it('rejects a connection string that is not MongoDB', () => {
    expect(() => parseEnv({ MONGODB_URI: 'postgres://localhost/plp' })).toThrow(/mongodb/);
  });
});
