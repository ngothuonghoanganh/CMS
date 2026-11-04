import {
  type Composition,
  DEFAULT_PAGE_MOTION,
  type PageMotion,
  type SectionInstance,
  type SectionMotion,
  type SectionType,
  templateIndustries,
} from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import {
  isMotionLocked,
  MOTION_FITS,
  MOTION_LEVELS,
  MOTION_STYLES,
  motionCapabilityOf,
  pageAccentOn,
  resolveSectionMotion,
} from './motion.js';
import { storedPageMotion, storedSectionMotion } from './motion-storage.js';
import { createSectionInstance, parseComposition } from './registry.js';
import { buildCompositionFromTemplate, systemTemplates } from './templates.js';

let nextId = 0;
function section(type: SectionType, variant?: string, motion?: SectionMotion): SectionInstance {
  nextId += 1;
  const instance = createSectionInstance(type, variant, `mot${String(nextId).padStart(8, '0')}`);
  return motion === undefined ? instance : { ...instance, motion };
}

function page(sections: SectionInstance[], motion?: Partial<PageMotion>): Composition {
  return {
    version: 1,
    ...(motion === undefined ? {} : { motion: { ...DEFAULT_PAGE_MOTION, ...motion } }),
    sections,
  };
}

/** A page as board 37 draws it: navigation, Hero, then the sections that may move. */
function boardPage(motion?: Partial<PageMotion>, extra: SectionInstance[] = []): Composition {
  return page(
    [
      section('navbar'),
      section('hero', 'split'),
      section('benefits', 'grid'),
      section('benefits', 'alternate'),
      section('benefits', 'steps'),
      section('faq'),
      ...extra,
      section('footer'),
    ],
    motion,
  );
}

describe('motion styles', () => {
  it('keep every timing of the styles that move within what the design note allows', () => {
    for (const [id, style] of Object.entries(MOTION_STYLES)) {
      if (id === 'none') {
        expect(style.enter).toBe('none');
        continue;
      }
      // 250–400 ms (ADR-032); "Sang trọng" keeps a slower reveal.
      expect(style.durationMs, id).toBeGreaterThanOrEqual(250);
      expect(style.durationMs, id).toBeLessThanOrEqual(id === 'luxe' ? 500 : 400);
      expect(style.stepMs, id).toBeGreaterThan(0);
    }
  });

  it('suit each industry of the template filter with styles that move', () => {
    for (const industry of templateIndustries) {
      expect(MOTION_FITS[industry].length).toBeGreaterThan(0);
      expect(MOTION_FITS[industry]).not.toContain('none');
    }
  });
});

describe('isMotionLocked', () => {
  it('keeps the navigation bar and the first section of the body still', () => {
    const sections = boardPage().sections;
    expect(sections.map((_section, index) => isMotionLocked(sections, index))).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it('locks the first section of a page without a navigation bar', () => {
    const sections = [section('benefits', 'grid'), section('faq')];
    expect(isMotionLocked(sections, 0)).toBe(true);
    expect(isMotionLocked(sections, 1)).toBe(false);
  });
});

describe('resolveSectionMotion', () => {
  it('moves nothing on a page without a style, whatever a section says', () => {
    const composition = boardPage(undefined, [section('cta_band', undefined, { enter: 'pop' })]);
    for (const index of composition.sections.keys()) {
      expect(resolveSectionMotion(composition, index)).toBeNull();
    }
  });

  it('follows the page style in a section that changes nothing', () => {
    const composition = boardPage({ style: 'smooth' });
    expect(resolveSectionMotion(composition, 5)).toEqual({
      enter: 'up',
      order: 'stagger',
      accents: ['lines'],
      durationMs: 360,
      stepMs: 70,
    });
  });

  it('keeps locked sections still', () => {
    const composition = boardPage({ style: 'lively' });
    expect(resolveSectionMotion(composition, 0)).toBeNull();
    expect(resolveSectionMotion(composition, 1)).toBeNull();
  });

  it('applies what a section changes, and shows it at once with "Không hiệu ứng"', () => {
    const composition = boardPage({ style: 'smooth' }, [
      section('cta_band', undefined, { enter: 'pop', order: 'together' }),
      section('faq', undefined, { enter: 'none' }),
    ]);
    expect(resolveSectionMotion(composition, 6)).toMatchObject({
      enter: 'pop',
      order: 'together',
      stepMs: 0,
    });
    expect(resolveSectionMotion(composition, 7)).toBeNull();
  });

  it('enters row by row only in a section laid out in rows', () => {
    const composition = boardPage({ style: 'playful' });
    expect(resolveSectionMotion(composition, 2)?.order).toBe('rows');
    expect(resolveSectionMotion(composition, 5)?.order).toBe('stagger');
  });

  it('runs an accent only where the section has matching content', () => {
    const composition = boardPage({ style: 'luxe' });
    // Lines and image are the style's accents; the grid has no image, the rows have one.
    expect(resolveSectionMotion(composition, 2)?.accents).toEqual(['lines']);
    expect(resolveSectionMotion(composition, 3)?.accents).toEqual(['lines', 'image']);
  });

  it('lets the page and then the section switch an accent away from the style', () => {
    const pageOff = boardPage({ style: 'smooth', accents: { lines: false } });
    expect(resolveSectionMotion(pageOff, 5)?.accents).toEqual([]);
    const sectionOn = boardPage({ style: 'smooth', accents: { lines: false } }, [
      section('faq', undefined, { accents: { lines: true } }),
    ]);
    expect(resolveSectionMotion(sectionOn, 6)?.accents).toEqual(['lines']);
  });

  it('enters the steps of a process one by one, far enough apart for the connector', () => {
    const composition = boardPage({ style: 'playful' });
    expect(resolveSectionMotion(composition, 4)).toMatchObject({
      order: 'stagger',
      accents: ['steps'],
      stepMs: 210,
    });
    const together = boardPage({ style: 'subtle', accents: { steps: true } });
    expect(resolveSectionMotion(together, 4)).toMatchObject({ order: 'stagger', stepMs: 180 });
  });

  it('scales the duration with the level', () => {
    for (const [level, definition] of Object.entries(MOTION_LEVELS)) {
      const composition = boardPage({ style: 'smooth', level: level as PageMotion['level'] });
      expect(resolveSectionMotion(composition, 5)?.durationMs).toBe(
        Math.round(360 * definition.durationFactor),
      );
    }
  });
});

describe('pageAccentOn and motionCapabilityOf', () => {
  it('reads the style unless the page switched the accent', () => {
    const smooth: PageMotion = { ...DEFAULT_PAGE_MOTION, style: 'smooth' };
    expect(pageAccentOn(smooth, 'lines')).toBe(true);
    expect(pageAccentOn(smooth, 'image')).toBe(false);
    expect(pageAccentOn({ ...smooth, accents: { image: true } }, 'image')).toBe(true);
  });

  it('gives navigation and footer nothing to move with', () => {
    expect(motionCapabilityOf({ type: 'navbar', variant: 'logo-cta' })).toEqual({
      grid: false,
      accents: [],
    });
    expect(motionCapabilityOf({ type: 'footer', variant: 'basic' }).accents).toEqual([]);
    expect(motionCapabilityOf({ type: 'benefits', variant: 'steps' })).toEqual({
      grid: true,
      accents: ['lines', 'steps'],
    });
  });
});

describe('stored motion', () => {
  it('leaves out a page motion that changes nothing', () => {
    expect(storedPageMotion(undefined)).toBeUndefined();
    expect(storedPageMotion(DEFAULT_PAGE_MOTION)).toBeUndefined();
    expect(storedPageMotion({ ...DEFAULT_PAGE_MOTION, accents: { lines: undefined } })).toBe(
      undefined,
    );
    expect(storedPageMotion({ ...DEFAULT_PAGE_MOTION, style: 'smooth' })).toEqual({
      ...DEFAULT_PAGE_MOTION,
      style: 'smooth',
    });
  });

  it('leaves out a section motion that follows the page in everything', () => {
    expect(storedSectionMotion({})).toBeUndefined();
    expect(storedSectionMotion({ accents: {} })).toBeUndefined();
    expect(storedSectionMotion({ enter: 'pop', accents: { lines: false } })).toEqual({
      enter: 'pop',
      accents: { lines: false },
    });
  });

  it('keeps motion through parseComposition and drops what changes nothing', () => {
    const moving = boardPage({ style: 'luxe', level: 'high' }, [
      section('faq', undefined, { order: 'together' }),
    ]);
    const kept = parseComposition(moving);
    expect(kept.success && kept.composition.motion).toEqual({
      ...DEFAULT_PAGE_MOTION,
      style: 'luxe',
      level: 'high',
    });
    expect(kept.success && kept.composition.sections[6]?.motion).toEqual({ order: 'together' });

    const still = parseComposition(
      boardPage({ style: 'none' }, [section('faq', undefined, { accents: {} })]),
    );
    expect(still.success && 'motion' in still.composition).toBe(false);
    expect(still.success && still.composition.sections.some((entry) => 'motion' in entry)).toBe(
      false,
    );
  });
});

describe('system templates', () => {
  it('start pages with a motion style that suits their industry', () => {
    for (const template of systemTemplates) {
      expect(MOTION_FITS[template.industry], template.id).toContain(template.motion);
      let id = 0;
      const composition = buildCompositionFromTemplate(template, () => {
        id += 1;
        return `tpl${String(id).padStart(8, '0')}`;
      });
      expect(composition.motion?.style, template.id).toBe(template.motion);
    }
  });
});
