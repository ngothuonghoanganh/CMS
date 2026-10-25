import { describe, expect, it } from 'vitest';
import { ReleasesRepository } from './releases.repository.js';

describe('ReleasesRepository', () => {
  it('only inserts and finds: releases are immutable (ADR-005)', () => {
    const methods = Object.getOwnPropertyNames(ReleasesRepository.prototype).filter(
      (name) => name !== 'constructor',
    );
    expect(methods.length).toBeGreaterThan(0);
    for (const name of methods) {
      expect(name === 'insert' || name.startsWith('find') || name.startsWith('list')).toBe(true);
    }
    expect(methods.some((name) => /update|delete|remove|replace|save|upsert/i.test(name))).toBe(
      false,
    );
  });
});
