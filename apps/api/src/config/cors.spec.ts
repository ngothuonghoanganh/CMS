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

  it('normalizes trailing slashes and duplicate origins', () => {
    expect(
      resolveCorsPolicy({
        CORS_ORIGIN: 'https://cms.example.com/, https://cms.example.com',
        NODE_ENV: 'production',
      }),
    ).toEqual({
      credentials: true,
      origin: ['https://cms.example.com'],
    });
  });

  it('rejects origins with paths or unsupported protocols', () => {
    expect(() =>
      resolveCorsPolicy({
        CORS_ORIGIN: 'https://cms.example.com/admin',
        NODE_ENV: 'production',
      }),
    ).toThrow('Invalid CORS origin');

    expect(() =>
      resolveCorsPolicy({
        CORS_ORIGIN: 'ftp://cms.example.com',
        NODE_ENV: 'production',
      }),
    ).toThrow('Invalid CORS origin');
  });

  it('does not enable credentialed CORS when no origins are configured', () => {
    expect(resolveCorsPolicy({ CORS_ORIGIN: '', NODE_ENV: 'production' })).toEqual({
      credentials: false,
      origin: false,
    });
  });
});
