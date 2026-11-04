import {
  type AiBrief,
  type AiTone,
  type MotionStyle,
  type TemplateIndustry,
  templateIndustries,
} from '@plp/contracts';
import { MOTION_FITS } from './motion.js';

/*
 * The motion style "Tạo trang bằng AI" expects before the AI chooses (ADR-031, ADR-032): the
 * structure step shows it without asking the AI, and the job falls back on it when the AI's choice
 * fails. The industry comes from words of the brief, else the tone decides.
 */

/**
 * Words that name an industry, in Vietnamese and English. They are matched as whole words without
 * diacritics, since many people type without them, so each must stay unambiguous that way: "răng"
 * alone would also be "rạng rỡ", "trường" also "thị trường", "lẩu" also "lâu năm".
 */
const INDUSTRY_WORDS: Readonly<Record<TemplateIndustry, readonly string[]>> = {
  dental_health: [
    'nha khoa',
    'niềng răng',
    'răng sứ',
    'trồng răng',
    'tẩy trắng răng',
    'chỉnh nha',
    'implant',
    'invisalign',
    'phòng khám',
    'bác sĩ',
    'y tế',
    'bệnh viện',
    'dental',
    'dentist',
    'orthodontic',
    'teeth',
    'clinic',
    'medical',
    'doctor',
    'healthcare',
  ],
  spa_beauty: [
    'spa',
    'làm đẹp',
    'thẩm mỹ',
    'chăm sóc da',
    'trị mụn',
    'massage',
    'nail',
    'salon',
    'làm tóc',
    'mỹ phẩm',
    'phun xăm',
    'triệt lông',
    'beauty',
    'skincare',
    'cosmetics',
    'facial',
  ],
  education: [
    'khóa học',
    'khoá học',
    'đào tạo',
    'giáo dục',
    'lớp học',
    'học viên',
    'học sinh',
    'sinh viên',
    'tiếng anh',
    'luyện thi',
    'gia sư',
    'ielts',
    'toeic',
    'course',
    'courses',
    'education',
    'school',
    'tutor',
    'academy',
    'students',
  ],
  real_estate: [
    'bất động sản',
    'căn hộ',
    'chung cư',
    'nhà phố',
    'biệt thự',
    'đất nền',
    'shophouse',
    'condotel',
    'penthouse',
    'real estate',
    'apartment',
    'apartments',
    'property',
    'condo',
    'villa',
  ],
  food_beverage: [
    'nhà hàng',
    'quán ăn',
    'quán lẩu',
    'cà phê',
    'trà sữa',
    'món ăn',
    'ẩm thực',
    'đồ ăn',
    'đồ uống',
    'tiệm bánh',
    'bánh ngọt',
    'bánh mì',
    'đồ nướng',
    'buffet',
    'cafe',
    'coffee',
    'restaurant',
    'food',
    'bakery',
    'menu',
    'pizza',
  ],
  fitness: [
    'gym',
    'thể hình',
    'thể dục',
    'tập luyện',
    'huấn luyện viên',
    'giảm cân',
    'giảm mỡ',
    'tăng cơ',
    'yoga',
    'pilates',
    'fitness',
    'boxing',
    'zumba',
    'aerobic',
    'crossfit',
    'workout',
    'personal trainer',
    'pt',
  ],
};

/** Lower case, without diacritics, words split by single spaces and padded with one on each side. */
function plainWords(text: string): string {
  const words = text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '');
  return ` ${words.join(' ')} `;
}

const PLAIN_INDUSTRY_WORDS = templateIndustries.map(
  (industry) => [industry, INDUSTRY_WORDS[industry].map(plainWords)] as const,
);

/**
 * The industry the brief's words name most, or null when none does. A tie goes to the industry
 * listed first: "nha khoa thẩm mỹ" is a dental clinic.
 */
export function inferIndustry(
  brief: Pick<AiBrief, 'product' | 'audience' | 'differentiators'>,
): TemplateIndustry | null {
  const text = plainWords([brief.product, brief.audience, brief.differentiators].join(' '));
  let best: TemplateIndustry | null = null;
  let bestScore = 0;
  for (const [industry, words] of PLAIN_INDUSTRY_WORDS) {
    const score = words.filter((word) => text.includes(word)).length;
    if (score > bestScore) {
      best = industry;
      bestScore = score;
    }
  }
  return best;
}

/** The style a tone suggests when the brief names no industry. */
const TONE_STYLES: Readonly<Record<AiTone, Exclude<MotionStyle, 'none'>>> = {
  professional: 'subtle',
  energetic: 'lively',
  friendly: 'smooth',
};

export interface MotionSuggestion {
  style: Exclude<MotionStyle, 'none'>;
  /** Why: the industry the brief names, else its tone. */
  industry: TemplateIndustry | null;
}

/** The style that suits the brief: its industry's first, else its tone's. */
export function suggestMotionStyle(
  brief: Pick<AiBrief, 'product' | 'audience' | 'differentiators' | 'tone'>,
): MotionSuggestion {
  const industry = inferIndustry(brief);
  const fit = industry === null ? undefined : MOTION_FITS[industry].find(movingStyle);
  return fit === undefined
    ? { style: TONE_STYLES[brief.tone], industry: null }
    : { style: fit, industry };
}

function movingStyle(style: MotionStyle): style is Exclude<MotionStyle, 'none'> {
  return style !== 'none';
}
