// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cx } from './cx';
import { hasContent } from './hasContent';

describe('cx', () => {
  it('joins class names and skips empty values', () => {
    expect(cx('a', undefined, false, null, '', 'b')).toBe('a b');
    expect(cx()).toBe('');
  });
});

describe('hasContent', () => {
  it.each([
    [undefined, false],
    [null, false],
    [false, false],
    [true, false],
    ['', false],
    ['Lý do', true],
    [0, true],
  ] as const)('%j → %s', (node, expected) => {
    expect(hasContent(node)).toBe(expected);
  });
});
