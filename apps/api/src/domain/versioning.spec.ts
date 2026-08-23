import { describe, expect, it } from 'vitest';

import { assertExpectedVersionNumber, nextVersionNumber } from './versioning';

describe('page version policy', () => {
  it('starts at version one and increments from the latest snapshot', () => {
    expect(nextVersionNumber(undefined)).toBe(1);
    expect(nextVersionNumber(1)).toBe(2);
  });

  it('accepts a matching optimistic version and rejects a stale one', () => {
    expect(() => assertExpectedVersionNumber(3, 3)).not.toThrow();
    expect(() => assertExpectedVersionNumber(2, 3)).toThrowError(
      expect.objectContaining({ status: 409 }),
    );
  });
});
