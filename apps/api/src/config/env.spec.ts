import { describe, expect, it } from 'vitest';

import { parseEnvironment } from './env';

describe('parseEnvironment', () => {
  it('provides safe local defaults', () => {
    expect(parseEnvironment({})).toMatchObject({
      MONGODB_URI: 'mongodb://127.0.0.1:27017/payload_landing_platform',
      NODE_ENV: 'development',
      PORT: 3001,
    });
  });

  it('rejects an invalid MongoDB connection string', () => {
    expect(() => parseEnvironment({ MONGODB_URI: 'postgres://localhost' })).toThrow(
      'MONGODB_URI must be a MongoDB connection string',
    );
  });
});
