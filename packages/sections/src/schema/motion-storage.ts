import {
  DEFAULT_PAGE_MOTION,
  type MotionAccentOverrides,
  motionAccentIds,
  type PageMotion,
  type SectionMotion,
} from '@plp/contracts';

/*
 * The motion a composition stores (ADR-032): nothing where it changes nothing, so a page that never
 * moved, a page made before motion existed and a page set back to "Không hiệu ứng" compare equal,
 * and a section set back to "theo trang" shows no change.
 */

function definedAccents(accents: MotionAccentOverrides): MotionAccentOverrides {
  const defined: MotionAccentOverrides = {};
  for (const accent of motionAccentIds) {
    const value = accents[accent];
    if (value !== undefined) {
      defined[accent] = value;
    }
  }
  return defined;
}

export function storedPageMotion(motion: PageMotion | undefined): PageMotion | undefined {
  if (motion === undefined) {
    return undefined;
  }
  const accents = definedAccents(motion.accents);
  const isDefault =
    motion.style === DEFAULT_PAGE_MOTION.style &&
    motion.level === DEFAULT_PAGE_MOTION.level &&
    motion.reduceOnMobile === DEFAULT_PAGE_MOTION.reduceOnMobile &&
    Object.keys(accents).length === 0;
  return isDefault
    ? undefined
    : { style: motion.style, level: motion.level, accents, reduceOnMobile: motion.reduceOnMobile };
}

export function storedSectionMotion(motion: SectionMotion | undefined): SectionMotion | undefined {
  if (motion === undefined) {
    return undefined;
  }
  const stored: SectionMotion = {};
  if (motion.enter !== undefined) {
    stored.enter = motion.enter;
  }
  if (motion.order !== undefined) {
    stored.order = motion.order;
  }
  const accents = definedAccents(motion.accents ?? {});
  if (Object.keys(accents).length > 0) {
    stored.accents = accents;
  }
  return Object.keys(stored).length === 0 ? undefined : stored;
}
