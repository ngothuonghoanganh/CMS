import { describe, expect, it } from 'vitest';
import { deepEqual } from './deep-equal.js';

describe('deepEqual', () => {
  it('compares primitives by value', () => {
    expect(deepEqual('a', 'a')).toBe(true);
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual(1, '1')).toBe(false);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(null, undefined)).toBe(false);
    expect(deepEqual(Number.NaN, Number.NaN)).toBe(true);
  });

  it('ignores object key order', () => {
    expect(deepEqual({ a: 1, b: { c: 2, d: [1, 2] } }, { b: { d: [1, 2], c: 2 }, a: 1 })).toBe(
      true,
    );
  });

  it('treats a missing key like an undefined value', () => {
    expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1, b: null })).toBe(false);
  });

  it('compares arrays in order and by length', () => {
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(deepEqual([], {})).toBe(false);
  });

  it('detects nested differences', () => {
    expect(
      deepEqual({ link: { kind: 'url', url: 'a' } }, { link: { kind: 'url', url: 'b' } }),
    ).toBe(false);
  });

  it('compares dates by time', () => {
    expect(deepEqual(new Date(1000), new Date(1000))).toBe(true);
    expect(deepEqual(new Date(1000), new Date(2000))).toBe(false);
    expect(deepEqual(new Date(1000), {})).toBe(false);
  });
});
