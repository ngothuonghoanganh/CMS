import { describe, expect, it } from 'vitest';
import { ConsentVersionsRepository } from './consent-versions.repository.js';

describe('ConsentVersionsRepository', () => {
  it('only inserts and reads: consent versions are immutable (ADR-017)', () => {
    const methods = Object.getOwnPropertyNames(ConsentVersionsRepository.prototype).filter(
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
