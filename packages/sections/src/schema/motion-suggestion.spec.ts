import { describe, expect, it } from 'vitest';
import { MOTION_FITS } from './motion.js';
import { inferIndustry, suggestMotionStyle } from './motion-suggestion.js';

function brief(product: string, differentiators = '', audience = '') {
  return { product, audience, differentiators, tone: 'friendly' as const };
}

describe('inferIndustry', () => {
  it('reads the industry from the words of the brief, in Vietnamese and English', () => {
    expect(
      inferIndustry(
        brief(
          'Niềng răng trong suốt Invisalign',
          'Bác sĩ nhiều năm kinh nghiệm chỉnh nha. Chụp phim 3D miễn phí.',
        ),
      ),
    ).toBe('dental_health');
    expect(inferIndustry(brief('Liệu trình chăm sóc da và trị mụn'))).toBe('spa_beauty');
    expect(inferIndustry(brief('Khóa học IELTS cấp tốc', '', 'Sinh viên năm cuối'))).toBe(
      'education',
    );
    expect(inferIndustry(brief('Căn hộ ven sông Thủ Thiêm'))).toBe('real_estate');
    expect(inferIndustry(brief('Quán lẩu nướng Hàn Quốc', 'Buffet 199k'))).toBe('food_beverage');
    expect(inferIndustry(brief('Yoga studio', 'Small classes with a personal trainer'))).toBe(
      'fitness',
    );
  });

  it('matches words typed without diacritics, and whole words only', () => {
    expect(inferIndustry(brief('nieng rang trong suot', 'bac si chinh nha'))).toBe('dental_health');
    // "rạng rỡ" is no tooth, "thị trường" no school, "lâu năm" no hot pot.
    expect(inferIndustry(brief('Nụ cười rạng rỡ', 'Thương hiệu lâu năm trên thị trường'))).toBe(
      null,
    );
    // "spa" inside another word names nothing.
    expect(inferIndustry(brief('Spaghetti tự làm'))).toBe(null);
  });

  it('takes the industry named most, and the first listed on a tie', () => {
    expect(inferIndustry(brief('Spa chăm sóc da', 'Có bác sĩ da liễu tư vấn'))).toBe('spa_beauty');
    expect(inferIndustry(brief('Nha khoa thẩm mỹ'))).toBe('dental_health');
  });

  it('names no industry for a brief without its words', () => {
    expect(inferIndustry(brief('Phần mềm kế toán cho hộ kinh doanh'))).toBeNull();
  });
});

describe('suggestMotionStyle', () => {
  it('suggests the first style that suits the industry', () => {
    expect(suggestMotionStyle(brief('Nha khoa Smile'))).toEqual({
      style: MOTION_FITS.dental_health[0],
      industry: 'dental_health',
    });
    expect(suggestMotionStyle({ ...brief('Biệt thự nghỉ dưỡng'), tone: 'energetic' })).toEqual({
      style: 'luxe',
      industry: 'real_estate',
    });
  });

  it('follows the tone when the brief names no industry', () => {
    const product = 'Phần mềm kế toán';
    expect(suggestMotionStyle({ ...brief(product), tone: 'professional' })).toEqual({
      style: 'subtle',
      industry: null,
    });
    expect(suggestMotionStyle({ ...brief(product), tone: 'energetic' }).style).toBe('lively');
    expect(suggestMotionStyle({ ...brief(product), tone: 'friendly' }).style).toBe('smooth');
  });
});
