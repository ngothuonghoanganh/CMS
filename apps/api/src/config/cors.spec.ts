import { describe, expect, it } from 'vitest';

import { resolveCorsPolicy } from './cors';

describe('resolveCorsPolicy', () => {
  it('allows the development wildcard for the local authenticated fixture', () => {
    expect(resolveCorsPolicy({ CORS_ORIGIN: '*', NODE_ENV: 'development' })).toEqual({
      credentials: true,
      origin: true,
    });
  });

  it('rejects a wildcard in production', () => {
    expect(() => resolveCorsPolicy({ CORS_ORIGIN: '*', NODE_ENV: 'production' })).toThrow(
      'Wildcard CORS origins are not allowed in production',
    );
  });

  it('keeps production credentialed CORS on an explicit allowlist', () => {
    expect(
      resolveCorsPolicy({
        CORS_ORIGIN: 'https://cms.example.com, https://preview.example.com',
        NODE_ENV: 'production',
      }),
    ).toEqual({
      credentials: true,
      origin: ['https://cms.example.com', 'https://preview.example.com'],
    });
  });

  it('does not enable credentialed CORS when no origins are configured', () => {
    expect(resolveCorsPolicy({ CORS_ORIGIN: '', NODE_ENV: 'production' })).toEqual({
      credentials: false,
      origin: false,
    });
  });
});
