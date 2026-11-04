import { type Composition, DEFAULT_PAGE_MOTION, type PageMotion } from '@plp/contracts';
import { createSectionInstance } from '@plp/sections/schema';
import { describe, expect, it } from 'vitest';
import {
  lockReasonOf,
  motionChipOf,
  motionFitsOf,
  motionPillOf,
  playBannerOf,
  styleSample,
  templateMotionOf,
} from './motion-view';

function page(motion?: Partial<PageMotion>): Composition {
  return {
    version: 1,
    ...(motion === undefined ? {} : { motion: { ...DEFAULT_PAGE_MOTION, ...motion } }),
    sections: [
      createSectionInstance('navbar', undefined, 'navbar000001'),
      createSectionInstance('hero', undefined, 'hero00000001'),
      { ...createSectionInstance('benefits', 'grid', 'benefits0001'), motion: { enter: 'pop' } },
      { ...createSectionInstance('faq', undefined, 'faq000000001'), motion: { order: 'together' } },
      {
        ...createSectionInstance('cta_band', undefined, 'ctaband00001'),
        motion: { accents: { lines: false } },
      },
      { ...createSectionInstance('logos', undefined, 'logos0000001'), motion: { enter: 'none' } },
      createSectionInstance('footer', undefined, 'footer000001'),
    ],
  };
}

describe('the template a page was made from', () => {
  it('names its motion style and the styles that suit its industry', () => {
    const dental = { source: 'system', templateId: 'nha-khoa-uu-dai', version: 2 } as const;
    expect(templateMotionOf(dental)).toBe('smooth');
    expect(motionFitsOf(dental)).toEqual(['subtle', 'smooth']);
  });

  it('says nothing for a workspace template, an unknown one or no template', () => {
    const own = {
      source: 'workspace',
      templateId: '64b000000000000000000009',
      version: 1,
    } as const;
    expect(templateMotionOf(own)).toBeNull();
    expect(motionFitsOf(own)).toEqual([]);
    expect(templateMotionOf(null)).toBeNull();
    expect(motionFitsOf({ source: 'system', templateId: 'khong-co-mau', version: 1 })).toEqual([]);
  });
});

describe('motionPillOf', () => {
  it('marks what a section changes of the page, and the sections that always show', () => {
    const composition = page({ style: 'smooth' });
    expect(composition.sections.map((_section, index) => motionPillOf(composition, index))).toEqual(
      [
        { text: 'Luôn hiện ngay', own: false, locked: true },
        { text: 'Luôn hiện ngay', own: false, locked: true },
        { text: 'Riêng · Bật lên', own: true, locked: false },
        { text: 'Riêng · cùng lúc', own: true, locked: false },
        { text: 'Riêng · điểm nhấn', own: true, locked: false },
        { text: 'Không hiệu ứng', own: false, locked: false },
        null,
      ],
    );
  });

  it('shows none on a page that does not move', () => {
    const composition = page();
    expect(
      composition.sections.every((_section, index) => motionPillOf(composition, index) === null),
    ).toBe(true);
  });
});

describe('motionChipOf and lockReasonOf', () => {
  it('says how a played section enters', () => {
    const composition = page({ style: 'smooth' });
    expect(motionChipOf(composition, 1)).toBe('Hiện ngay');
    expect(motionChipOf(composition, 2)).toBe('Bật lên + tiêu đề hiện từng dòng · lần lượt');
    expect(motionChipOf(composition, 3)).toBe('Trượt lên + tiêu đề hiện từng dòng');
    expect(motionChipOf(composition, 4)).toBe('Trượt lên · lần lượt');
  });

  it('explains why the navigation bar and the first section never move', () => {
    const { sections } = page({ style: 'smooth' });
    expect(lockReasonOf(sections, 0)).toMatch(/^Thanh điều hướng/);
    expect(lockReasonOf(sections, 1)).toMatch(/^Section đầu trang/);
    expect(lockReasonOf(sections, 2)).toBeNull();
  });
});

describe('styleSample', () => {
  it('moves a sample with the style, or with an entrance of the section panel', () => {
    expect(styleSample('none', 'mid')).toBeNull();
    expect(styleSample('lively', 'mid')).toMatchObject({ enter: 'side', order: 'stagger' });
    expect(styleSample('smooth', 'mid', 'zoom')).toMatchObject({ enter: 'zoom' });
    expect(styleSample('smooth', 'mid', 'none')).toBeNull();
  });
});

describe('playBannerOf', () => {
  it('says what plays, how and when it is done', () => {
    const composition = page({ style: 'luxe', level: 'high', reduceOnMobile: true });
    const banner = (done: boolean, slow: boolean, reduced: boolean, phone = false) =>
      playBannerOf(composition, { done, slow, reduced, sectionLabel: null }, phone);
    expect(banner(false, false, false)).toEqual({
      title: 'Đang chạy thử',
      detail: 'Cả trang · Sang trọng · mức Rõ',
    });
    expect(banner(true, true, false, true)).toEqual({
      title: 'Đã chạy thử xong',
      detail: 'Cả trang · Sang trọng · mức Rõ · điện thoại chỉ hiện dần · ¼ tốc độ',
    });
    expect(banner(false, false, true).detail).toMatch(/^Như thiết bị bật giảm chuyển động/);
    expect(
      playBannerOf(
        composition,
        { done: false, slow: false, reduced: false, sectionLabel: 'Lợi ích' },
        false,
      ).detail,
    ).toBe('Section Lợi ích · Sang trọng · mức Rõ');
  });
});
