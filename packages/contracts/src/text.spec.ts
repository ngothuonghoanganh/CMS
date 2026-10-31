import { describe, expect, it } from 'vitest';
import { slugify } from './text.js';

describe('slugify', () => {
  it('writes Vietnamese text without accents, in lowercase, words joined by dashes', () => {
    expect(slugify('Nha khoa Smile Care')).toBe('nha-khoa-smile-care');
    expect(slugify('Ưu đãi niềng răng 2026')).toBe('uu-dai-nieng-rang-2026');
    expect(slugify('Hồ Chí Minh')).toBe('ho-chi-minh');
  });

  it('turns đ and Đ into d, every time', () => {
    expect(slugify('Đà Nẵng')).toBe('da-nang');
    expect(slugify('đi đâu đó')).toBe('di-dau-do');
  });

  it('joins any run of other characters into one dash, none at either end', () => {
    expect(slugify('Nha  khoa – Smile')).toBe('nha-khoa-smile');
    expect(slugify('  ** Khuyến mãi tháng 11 **  ')).toBe('khuyen-mai-thang-11');
    expect(slugify('***')).toBe('');
  });

  it('keeps 60 characters by default, or the length asked for', () => {
    expect(slugify('Ưu đãi niềng răng trong suốt Invisalign cho học sinh sinh viên tháng 11')).toBe(
      'uu-dai-nieng-rang-trong-suot-invisalign-cho-hoc-sinh-sinh-vi',
    );
    expect(slugify('abcdef', 3)).toBe('abc');
    expect(slugify('Nha khoa Smile Care', 8)).toBe('nha-khoa');
  });

  it('drops the dash a cut leaves at the end', () => {
    expect(slugify('nha khoa smile', 9)).toBe('nha-khoa');
  });
});
