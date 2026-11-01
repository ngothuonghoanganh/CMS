import { workspaceSlugSchema } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import { freeSlug, RESERVED_SLUGS, slugBaseOf } from './workspace-slug.js';

describe('workspace addresses (ADR-025)', () => {
  it('turns a Vietnamese workspace name into an address', () => {
    expect(slugBaseOf('Mây Xanh Agency')).toBe('may-xanh-agency');
    expect(slugBaseOf('Nha khoa Đông Đô')).toBe('nha-khoa-dong-do');
    expect(slugBaseOf('  Bếp Nhà Lá & Co.  ')).toBe('bep-nha-la-co');
    expect(slugBaseOf('Phở 24/7')).toBe('pho-24-7');
  });

  it('keeps every address within 3 to 40 characters', () => {
    expect(slugBaseOf('AB')).toBe('ab-ws');
    expect(slugBaseOf('Ủ')).toBe('u-ws');
    expect(slugBaseOf('!!!')).toBe('workspace');
    expect(slugBaseOf('😀')).toBe('workspace');
    const long = slugBaseOf('Công ty truyền thông '.repeat(4));
    expect(long.length).toBeLessThanOrEqual(40);
    expect(long.endsWith('-')).toBe(false);
    for (const name of ['Mây Xanh Agency', 'AB', '!!!', 'x'.repeat(80), 'a - - b']) {
      expect(workspaceSlugSchema.safeParse(slugBaseOf(name)).success).toBe(true);
    }
  });

  it('numbers an address already taken, and never gives a reserved one', () => {
    expect(freeSlug('may-xanh', new Set())).toBe('may-xanh');
    expect(freeSlug('may-xanh', new Set(['may-xanh']))).toBe('may-xanh-2');
    expect(freeSlug('may-xanh', new Set(['may-xanh', 'may-xanh-2']))).toBe('may-xanh-3');
    for (const reserved of RESERVED_SLUGS) {
      expect(freeSlug(reserved, new Set())).toBe(`${reserved}-2`);
    }
  });

  it('cuts a numbered address back to 40 characters', () => {
    const base = 'a'.repeat(40);
    const slug = freeSlug(base, new Set([base]));
    expect(slug).toBe(`${'a'.repeat(38)}-2`);
    expect(workspaceSlugSchema.safeParse(slug).success).toBe(true);
  });
});
