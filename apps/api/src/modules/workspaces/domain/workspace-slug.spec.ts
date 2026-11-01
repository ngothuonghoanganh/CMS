import { RESERVED_WORKSPACE_SLUGS, workspaceSlugSchema } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import { slugBaseOf, slugCandidates } from './workspace-slug.js';

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

  it('numbers the forms of a base, a batch at a time', () => {
    expect(slugCandidates('may-xanh', 1, 3)).toEqual(['may-xanh', 'may-xanh-2', 'may-xanh-3']);
    expect(slugCandidates('may-xanh', 21, 2)).toEqual(['may-xanh-21', 'may-xanh-22']);
  });

  it('never offers a reserved name', () => {
    for (const reserved of RESERVED_WORKSPACE_SLUGS) {
      expect(slugCandidates(reserved, 1, 2)).toEqual([`${reserved}-2`]);
    }
  });

  it('cuts a numbered address back to 40 characters, and the cut form is what is asked about', () => {
    const base = slugBaseOf('Công ty Cổ phần Đầu tư và Phát triển Hà Nội');
    expect(base).toBe('cong-ty-co-phan-dau-tu-va-phat-trien-ha');
    const candidates = slugCandidates(base, 1, 12);
    expect(candidates[1]).toBe('cong-ty-co-phan-dau-tu-va-phat-trien-h-2');
    expect(candidates[11]).toBe('cong-ty-co-phan-dau-tu-va-phat-trien-12');
    expect(new Set(candidates).size).toBe(12);
    for (const slug of candidates) {
      expect(workspaceSlugSchema.safeParse(slug).success).toBe(true);
    }
  });
});
