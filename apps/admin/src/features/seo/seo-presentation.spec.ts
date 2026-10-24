import { createSectionInstance } from '@plp/sections/schema';
import { describe, expect, it } from 'vitest';
import {
  effectiveTitle,
  finalizeSlug,
  heroHeadingOf,
  isSlugComplete,
  normalizeSlugTyping,
  redirectedLiveSlug,
  searchResultDescription,
  searchResultPath,
  searchResultTitle,
  seoTitleHint,
  siteInitial,
} from './seo-presentation';

const LIVE = {
  id: '64b0000000000000000000e1',
  version: 12,
  slug: 'uu-dai-thang-11',
  publishedAt: '2026-10-24T06:02:00.000Z',
};

function compositionWithHero(heading: string) {
  const hero = createSectionInstance('hero', undefined, 'hero00000001');
  return { version: 1 as const, sections: [{ ...hero, content: { ...hero.content, heading } }] };
}

describe('seoTitleHint', () => {
  it('explains an empty, a long and a good title', () => {
    expect(seoTitleHint('')).toEqual({
      tone: 'help',
      text: 'Đang để trống: sẽ dùng tiêu đề Hero.',
    });
    expect(seoTitleHint('   ')).toEqual({
      tone: 'help',
      text: 'Đang để trống: sẽ dùng tiêu đề Hero.',
    });
    expect(seoTitleHint('a'.repeat(61))).toEqual({
      tone: 'warning',
      text: 'Hơi dài: phần cuối có thể bị cắt trên kết quả tìm kiếm.',
    });
    expect(seoTitleHint('a'.repeat(60))).toEqual({ tone: 'help', text: 'Độ dài phù hợp.' });
  });
});

describe('search result truncation', () => {
  it('cuts titles over 60 characters to 58 and an ellipsis', () => {
    expect(searchResultTitle('a'.repeat(60))).toBe('a'.repeat(60));
    expect(searchResultTitle('a'.repeat(61))).toBe(`${'a'.repeat(58)}…`);
  });

  it('cuts descriptions over 160 characters to 157 and an ellipsis', () => {
    expect(searchResultDescription('b'.repeat(160))).toBe('b'.repeat(160));
    expect(searchResultDescription('b'.repeat(161))).toBe(`${'b'.repeat(157)}…`);
  });

  it('shows the host and the slug like a search result', () => {
    expect(searchResultPath('smilecare.payload.site', 'uu-dai')).toBe(
      'smilecare.payload.site › uu-dai',
    );
    expect(searchResultPath('smilecare.payload.site', '')).toBe('smilecare.payload.site');
    expect(siteInitial(' smile Care')).toBe('S');
    expect(siteInitial('')).toBe('?');
  });
});

describe('effective title', () => {
  it('falls back to the Hero heading, then the page name', () => {
    const composition = compositionWithHero('  Niềng răng trong suốt  ');
    expect(heroHeadingOf(composition)).toBe('Niềng răng trong suốt');
    expect(effectiveTitle('Ưu đãi | Smile Care', composition, 'Trang')).toBe('Ưu đãi | Smile Care');
    expect(effectiveTitle(' ', composition, 'Trang')).toBe('Niềng răng trong suốt');
    expect(effectiveTitle('', compositionWithHero(''), 'Trang ưu đãi')).toBe('Trang ưu đãi');
    expect(effectiveTitle('', { version: 1, sections: [] }, 'Trang ưu đãi')).toBe('Trang ưu đãi');
  });
});

describe('slug typing', () => {
  it('normalizes Vietnamese text while keeping a trailing hyphen', () => {
    expect(normalizeSlugTyping('Ưu đãi Tết')).toBe('uu-dai-tet');
    expect(normalizeSlugTyping('Đặt lịch ')).toBe('dat-lich-');
    expect(normalizeSlugTyping('--a__b')).toBe('a-b');
    expect(normalizeSlugTyping('x'.repeat(90))).toHaveLength(80);
    expect(isSlugComplete('dat-lich-')).toBe(false);
    expect(isSlugComplete('dat-lich')).toBe(true);
  });

  it('drops the trailing hyphen when typing ends', () => {
    expect(finalizeSlug('Đặt lịch -')).toBe('dat-lich');
    expect(finalizeSlug('')).toBe('');
  });
});

describe('redirectedLiveSlug', () => {
  it('names the live slug only when the page is live and the slug changed', () => {
    expect(redirectedLiveSlug({ liveRelease: null }, 'moi')).toBeNull();
    expect(redirectedLiveSlug({ liveRelease: LIVE }, 'uu-dai-thang-11')).toBeNull();
    expect(redirectedLiveSlug({ liveRelease: LIVE }, 'uu-dai-tet')).toBe('uu-dai-thang-11');
  });
});
