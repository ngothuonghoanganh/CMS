import { describe, expect, it } from 'vitest';
import { AppError } from '../../shared/errors.js';
import { parseIdempotencyKey } from './publishing.controller.js';

function failure(value: unknown): AppError {
  try {
    parseIdempotencyKey(value);
  } catch (error) {
    if (error instanceof AppError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected a validation error');
}

describe('parseIdempotencyKey', () => {
  it('accepts a key of 8 to 100 characters', () => {
    expect(parseIdempotencyKey('9b2f4c1e-0d8a-4a8e-9f61-3b2b5c7d9e10')).toBe(
      '9b2f4c1e-0d8a-4a8e-9f61-3b2b5c7d9e10',
    );
  });

  it('rejects a missing header with 422 on the header path', () => {
    const error = failure(undefined);
    expect(error.status).toBe(422);
    expect(error.code).toBe('validation_failed');
    expect(error.issues?.[0]).toMatchObject({
      path: ['headers', 'idempotency-key'],
      message: 'Thiếu header Idempotency-Key',
    });
  });

  it('rejects a short key and a repeated header', () => {
    expect(failure('short').issues?.[0]?.path).toEqual(['headers', 'idempotency-key']);
    expect(failure(['aaaaaaaaaa', 'bbbbbbbbbb']).status).toBe(422);
  });
});
