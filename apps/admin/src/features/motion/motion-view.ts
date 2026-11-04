import type {
  Composition,
  MotionAccent,
  MotionLevel,
  MotionStyle,
  SectionInstance,
  TemplateRef,
} from '@plp/contracts';
import {
  findSystemTemplate,
  isMotionLocked,
  MOTION_ACCENT_LABELS,
  MOTION_ENTER_LABELS,
  MOTION_FITS,
  MOTION_LEVELS,
  MOTION_ORDER_LABELS,
  MOTION_STYLES,
  motionCapabilityOf,
  pageMotionOf,
  resolveSectionMotion,
  type ResolvedSectionMotion,
  timedMotion,
} from '@plp/sections/schema';

/** What the editor says about motion (boards 37–39, ADR-032). Pure functions, unit-tested. */

/** One line under each accent's name on board 37. */
export const ACCENT_DESCRIPTIONS: Readonly<Record<MotionAccent, string>> = {
  lines: 'Tiêu đề section trượt lên theo dòng',
  image: 'Ảnh rõ dần, thu nhẹ vào khung',
  count: 'Con số chạy tới giá trị thật, một lần',
  steps: 'Đường nối giữa các bước vẽ dần',
};

/** How each entrance looks, under its tiles on board 38. */
export const ENTER_DESCRIPTIONS: Readonly<Record<keyof typeof MOTION_ENTER_LABELS, string>> = {
  none: 'Section hiện ngay, không chuyển động.',
  fade: 'Rõ dần khi khách cuộn tới.',
  up: 'Rõ dần và trượt lên một chút.',
  side: 'Theo bố cục: chữ vào từ bên trái, ảnh vào từ bên phải.',
  zoom: 'Rõ dần và lớn lên rất nhẹ.',
  pop: 'Bật lên với độ nảy nhẹ, hợp với thẻ và biểu tượng.',
  reveal: 'Hé lộ chậm rãi từ dưới lên.',
};

/** The motion style of the system template a page was made from, if any. */
export function templateMotionOf(createdFrom: TemplateRef | null): MotionStyle | null {
  return createdFrom?.source === 'system'
    ? (findSystemTemplate(createdFrom.templateId)?.motion ?? null)
    : null;
}

/** Styles that suit the industry of the system template a page was made from ("Hợp ngành"). */
export function motionFitsOf(createdFrom: TemplateRef | null): readonly MotionStyle[] {
  const template =
    createdFrom?.source === 'system' ? findSystemTemplate(createdFrom.templateId) : undefined;
  return template ? MOTION_FITS[template.industry] : [];
}

/** Why a section always shows at once, or null when it may move. */
export function lockReasonOf(
  sections: readonly Pick<SectionInstance, 'type'>[],
  index: number,
): string | null {
  if (!isMotionLocked(sections, index)) {
    return null;
  }
  return sections[index]?.type === 'navbar'
    ? 'Thanh điều hướng không có hiệu ứng để khách bấm được ngay.'
    : 'Section đầu trang không có hiệu ứng để khách thấy ngay tiêu đề chính và nút kêu gọi.';
}

export interface MotionPill {
  text: string;
  /** The section changes the page's motion. */
  own: boolean;
}

/** The pill of a section in the page structure (board 38); null on a page that does not move. */
export function motionPillOf(composition: Composition, index: number): MotionPill | null {
  const section = composition.sections[index];
  if (pageMotionOf(composition).style === 'none' || section === undefined) {
    return null;
  }
  if (isMotionLocked(composition.sections, index)) {
    return { text: 'Luôn hiện ngay', own: false };
  }
  const own = section.motion;
  if (own?.enter === 'none') {
    return { text: 'Không hiệu ứng', own: false };
  }
  if (own?.enter !== undefined) {
    return { text: `Riêng · ${MOTION_ENTER_LABELS[own.enter]}`, own: true };
  }
  if (own?.order !== undefined) {
    return { text: `Riêng · ${MOTION_ORDER_LABELS[own.order].toLowerCase()}`, own: true };
  }
  if (own?.accents !== undefined) {
    return { text: 'Riêng · điểm nhấn', own: true };
  }
  return null;
}

/** "Trượt lên + tiêu đề hiện từng dòng · lần lượt", or "Hiện ngay": the chip of a played section. */
export function motionChipOf(composition: Composition, index: number): string {
  const motion = resolveSectionMotion(composition, index);
  if (motion === null) {
    return 'Hiện ngay';
  }
  const accents = motion.accents.map((accent) => MOTION_ACCENT_LABELS[accent].toLowerCase());
  return `${MOTION_ENTER_LABELS[motion.enter]}${accents.length > 0 ? ` + ${accents.join(', ')}` : ''}${
    motion.order === 'together' ? '' : ` · ${MOTION_ORDER_LABELS[motion.order].toLowerCase()}`
  }`;
}

/** Accents a section has content for, in their order. */
export function sectionAccents(section: Pick<SectionInstance, 'type' | 'variant'>) {
  return motionCapabilityOf(section).accents;
}

/** How a sample of a style moves: its own entrance, order and accents. */
export function styleSample(
  style: MotionStyle,
  level: MotionLevel,
  enter = MOTION_STYLES[style].enter,
): ResolvedSectionMotion | null {
  const definition = MOTION_STYLES[style];
  return timedMotion(style, level, {
    enter,
    order: definition.order,
    accents: definition.accents,
  });
}

/** The banner over a played canvas (boards 37–38). */
export function playBannerOf(
  composition: Composition,
  play: { done: boolean; slow: boolean; reduced: boolean; sectionLabel: string | null },
  phone: boolean,
): { title: string; detail: string } {
  const motion = pageMotionOf(composition);
  const title = play.done ? 'Đã chạy thử xong' : 'Đang chạy thử';
  if (play.reduced) {
    return {
      title,
      detail: 'Như thiết bị bật giảm chuyển động: nội dung hiện ngay, số liệu hiện giá trị thật.',
    };
  }
  const parts = [
    play.sectionLabel === null ? 'Cả trang' : `Section ${play.sectionLabel}`,
    `${MOTION_STYLES[motion.style].label} · mức ${MOTION_LEVELS[motion.level].label}`,
    ...(phone && motion.reduceOnMobile ? ['điện thoại chỉ hiện dần'] : []),
    ...(play.slow ? ['¼ tốc độ'] : []),
  ];
  return { title, detail: parts.join(' · ') };
}
