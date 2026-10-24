import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './health.js';

describe('healthResponseSchema', () => {
  it('accepts a healthy response', () => {
    expect(healthResponseSchema.parse({ status: 'ok', mongo: 'up' })).toEqual({
      status: 'ok',
      mongo: 'up',
    });
  });

  it('rejects a response that reports the database as down', () => {
    expect(healthResponseSchema.safeParse({ status: 'ok', mongo: 'down' }).success).toBe(false);
  });
});
