import {
  type Composition,
  DEFAULT_PAGE_MOTION,
  type MotionAccent,
  motionAccentIds,
  type MotionEnter,
  type MotionLevel,
  type MotionOrder,
  type MotionStyle,
  type PageMotion,
  type SectionInstance,
  type SectionMotion,
  type TemplateIndustry,
} from '@plp/contracts';
import { getSectionDefinition, getVariant } from './registry.js';

/*
 * Motion presets (ADR-032). One function, `resolveSectionMotion`, combines the page's style, its
 * own changes and a section's, and what the section can show; the renderer, the editor, the
 * publish chips and the AI all use it, so they never disagree.
 */

export interface MotionStyleDefinition {
  label: string;
  /** One line under the name on its card: how it enters and in which order. */
  trait: string;
  summary: string;
  /** "Hợp với: …" */
  fits: string;
  enter: MotionEnter;
  order: MotionOrder;
  accents: readonly MotionAccent[];
  /** Duration of one part's entrance at level "Vừa". */
  durationMs: number;
  /** Delay between two parts entering one after another. */
  stepMs: number;
}

/*
 * Durations follow the 250–400 ms of the design note rather than the slower mockups; "Sang trọng"
 * keeps a longer reveal. They are to be checked on real devices (ADR-032).
 */
export const MOTION_STYLES: Readonly<Record<MotionStyle, MotionStyleDefinition>> = {
  none: {
    label: 'Không hiệu ứng',
    trait: 'Mọi thứ hiện ngay',
    summary: 'Mọi section hiện ngay khi trang tải, không chuyển động.',
    fits: 'mọi trang; mặc định cho trang mới',
    enter: 'none',
    order: 'together',
    accents: [],
    durationMs: 0,
    stepMs: 0,
  },
  subtle: {
    label: 'Tinh tế',
    trait: 'Hiện dần · cùng lúc',
    summary: 'Section rõ dần, các phần trong section hiện cùng lúc. Kín đáo, không gây chú ý.',
    fits: 'y tế, tài chính, dịch vụ chuyên nghiệp',
    enter: 'fade',
    order: 'together',
    accents: [],
    durationMs: 320,
    stepMs: 60,
  },
  smooth: {
    label: 'Mượt mà',
    trait: 'Trượt lên · lần lượt',
    summary: 'Section trượt lên, các phần hiện lần lượt. Tiêu đề hiện từng dòng, số liệu đếm lên.',
    fits: 'hầu hết landing page',
    enter: 'up',
    order: 'stagger',
    accents: ['lines', 'count', 'steps'],
    durationMs: 360,
    stepMs: 70,
  },
  lively: {
    label: 'Năng động',
    trait: 'Trượt từ bên · nhịp nhanh',
    summary: 'Chữ trượt vào từ trái, ảnh từ phải, nhịp nhanh. Số liệu đếm lên, các bước nối nhau.',
    fits: 'sự kiện, khóa học, thể thao',
    enter: 'side',
    order: 'stagger',
    accents: ['count', 'steps'],
    durationMs: 280,
    stepMs: 55,
  },
  luxe: {
    label: 'Sang trọng',
    trait: 'Hé lộ chậm · lần lượt',
    summary: 'Nội dung hé lộ chậm rãi, ảnh thu nhẹ vào khung, tiêu đề hiện từng dòng.',
    fits: 'bất động sản, spa, thời trang',
    enter: 'reveal',
    order: 'stagger',
    accents: ['lines', 'image'],
    durationMs: 480,
    stepMs: 110,
  },
  playful: {
    label: 'Vui tươi',
    trait: 'Bật lên · theo hàng',
    summary: 'Thẻ bật lên theo từng hàng với độ nảy nhẹ. Số liệu đếm lên, các bước nối nhau.',
    fits: 'ăn uống, khuyến mãi, đồ cho trẻ em',
    enter: 'pop',
    order: 'rows',
    accents: ['count', 'steps'],
    durationMs: 380,
    stepMs: 70,
  },
};

export interface MotionLevelDefinition {
  label: string;
  /** How far a part slides. */
  distancePx: number;
  /** The scale "Phóng nhẹ" starts from. */
  scale: number;
  /** The scale "Bật lên" starts from. */
  popScale: number;
  durationFactor: number;
}

export const MOTION_LEVELS: Readonly<Record<MotionLevel, MotionLevelDefinition>> = {
  low: { label: 'Nhẹ', distancePx: 8, scale: 0.98, popScale: 0.94, durationFactor: 0.85 },
  mid: { label: 'Vừa', distancePx: 12, scale: 0.96, popScale: 0.9, durationFactor: 1 },
  high: { label: 'Rõ', distancePx: 16, scale: 0.94, popScale: 0.86, durationFactor: 1.15 },
};

export const MOTION_ENTER_LABELS: Readonly<Record<MotionEnter, string>> = {
  none: 'Không hiệu ứng',
  fade: 'Hiện dần',
  up: 'Trượt lên',
  side: 'Trượt từ bên',
  zoom: 'Phóng nhẹ',
  pop: 'Bật lên',
  reveal: 'Hé lộ',
};

export const MOTION_ORDER_LABELS: Readonly<Record<MotionOrder, string>> = {
  together: 'Cùng lúc',
  stagger: 'Lần lượt',
  rows: 'Theo hàng',
};

export const MOTION_ACCENT_LABELS: Readonly<Record<MotionAccent, string>> = {
  lines: 'Tiêu đề hiện từng dòng',
  image: 'Ảnh hé lộ',
  count: 'Số liệu đếm lên',
  steps: 'Các bước nối nhau',
};

/** Styles that suit an industry, best first: the "Hợp ngành" badge (ADR-032). */
export const MOTION_FITS: Readonly<Record<TemplateIndustry, readonly MotionStyle[]>> = {
  dental_health: ['subtle', 'smooth'],
  spa_beauty: ['luxe', 'subtle'],
  education: ['lively', 'smooth'],
  real_estate: ['luxe', 'smooth'],
  food_beverage: ['playful', 'lively'],
  fitness: ['lively', 'playful'],
};

/** Steps of a process enter one by one, at least this far apart, while their connector draws. */
const STEPS_MIN_GAP_MS = 180;

export function pageMotionOf(composition: Pick<Composition, 'motion'>): PageMotion {
  return composition.motion ?? DEFAULT_PAGE_MOTION;
}

/** Whether a page accent is on: the user's change, else the style's own choice. */
export function pageAccentOn(page: PageMotion, accent: MotionAccent): boolean {
  return page.accents[accent] ?? MOTION_STYLES[page.style].accents.includes(accent);
}

export interface MotionCapability {
  /** Laid out in rows, so "Theo hàng" applies. */
  grid: boolean;
  /** Accents with matching content. */
  accents: readonly MotionAccent[];
}

const NO_CAPABILITY: MotionCapability = { grid: false, accents: [] };

export function motionCapabilityOf(
  section: Pick<SectionInstance, 'type' | 'variant'>,
): MotionCapability {
  const variant = getVariant(getSectionDefinition(section.type), section.variant);
  const motion = variant?.motion;
  return motion ? { grid: motion.grid ?? false, accents: motion.accents ?? [] } : NO_CAPABILITY;
}

/**
 * The navigation bar and the first section of the page body always show at once, so visitors read
 * the main heading and can press its buttons straight away.
 */
export function isMotionLocked(
  sections: readonly Pick<SectionInstance, 'type'>[],
  index: number,
): boolean {
  const section = sections[index];
  if (section === undefined || section.type === 'navbar') {
    return true;
  }
  const leading = sections.findIndex((entry, at) => at > 0 || entry.type !== 'navbar');
  return index === leading;
}

export interface ResolvedSectionMotion {
  enter: Exclude<MotionEnter, 'none'>;
  order: MotionOrder;
  accents: readonly MotionAccent[];
  durationMs: number;
  stepMs: number;
}

/**
 * How the section at `index` moves, or null when it shows at once: the page has no style, the
 * section is locked, or it enters with "Không hiệu ứng". "Theo hàng" falls back to "Lần lượt" in a
 * section without rows, accents need matching content, and a process whose steps connect enters
 * step by step.
 */
export function resolveSectionMotion(
  composition: Pick<Composition, 'motion' | 'sections'>,
  index: number,
): ResolvedSectionMotion | null {
  const page = pageMotionOf(composition);
  const section = composition.sections[index];
  if (
    page.style === 'none' ||
    section === undefined ||
    isMotionLocked(composition.sections, index)
  ) {
    return null;
  }
  const own: SectionMotion = section.motion ?? {};
  const capability = motionCapabilityOf(section);
  const order = own.order ?? MOTION_STYLES[page.style].order;
  return timedMotion(page.style, page.level, {
    enter: own.enter ?? MOTION_STYLES[page.style].enter,
    order: order === 'rows' && !capability.grid ? 'stagger' : order,
    accents: motionAccentIds.filter(
      (accent) =>
        capability.accents.includes(accent) &&
        (own.accents?.[accent] ?? pageAccentOn(page, accent)),
    ),
  });
}

/**
 * How parts enter with `enter`, `order` and `accents`, timed by the style and the level: what
 * `resolveSectionMotion` gives a section, and what the editor's samples of a style play. Null when
 * nothing moves.
 */
export function timedMotion(
  style: MotionStyle,
  level: MotionLevel,
  how: { enter: MotionEnter; order: MotionOrder; accents: readonly MotionAccent[] },
): ResolvedSectionMotion | null {
  const { enter, accents } = how;
  if (style === 'none' || enter === 'none') {
    return null;
  }
  const definition = MOTION_STYLES[style];
  const durationMs = Math.round(definition.durationMs * MOTION_LEVELS[level].durationFactor);
  if (accents.includes('steps')) {
    return {
      enter,
      order: 'stagger',
      accents,
      durationMs,
      stepMs: Math.max(definition.stepMs * 3, STEPS_MIN_GAP_MS),
    };
  }
  const stepMs = how.order === 'together' ? 0 : definition.stepMs;
  return { enter, order: how.order, accents, durationMs, stepMs };
}
