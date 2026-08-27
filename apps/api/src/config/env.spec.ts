import { describe, expect, it } from 'vitest';

import { parseEnvironment } from './env';

describe('parseEnvironment', () => {
  it('provides safe local defaults', () => {
    expect(parseEnvironment({})).toMatchObject({
      MONGODB_URI: 'mongodb://127.0.0.1:27018/payload_landing_platform',
      NODE_ENV: 'development',
      PORT: 3001,
    });
  });

  it('accepts the DNS verifier prefix and treats empty optional values as unset', () => {
    const config = parseEnvironment({
      DOMAIN_VERIFICATION_PREFIX: '_payload-verification',
      EMAIL_FROM: '',
      INTEGRATION_SECRET_ENCRYPTION_KEY: '',
      RESEND_API_KEY: '',
    });

    expect(config.DOMAIN_VERIFICATION_PREFIX).toBe('_payload-verification');
    expect(config.EMAIL_FROM).toBeUndefined();
    expect(config.INTEGRATION_SECRET_ENCRYPTION_KEY).toBeUndefined();
    expect(config.RESEND_API_KEY).toBeUndefined();
  });

  it('rejects an invalid MongoDB connection string', () => {
    expect(() => parseEnvironment({ MONGODB_URI: 'postgres://localhost' })).toThrow(
      'MONGODB_URI must be a MongoDB connection string',
    );
  });

  it('rejects the fake domain verifier in production', () => {
    expect(() =>
      parseEnvironment({
        DOMAIN_VERIFICATION_PROVIDER: 'fake',
        NODE_ENV: 'production',
      }),
    ).toThrow('Fake domain verification is not allowed in production');
  });
});
