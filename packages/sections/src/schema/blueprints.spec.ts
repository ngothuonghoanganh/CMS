import {
  type Brief,
  colorSchemeIds,
  compositionSchema,
  type PageGoal,
  pageGoalIds,
  type PageStyle,
  pageStyleIds,
  type SectionInstance,
  type SectionType,
  sectionTypes,
} from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import {
  buildCompositionFromGoal,
  goalDefinitions,
  goalOutline,
  isRecommendedFor,
  pageStyles,
  pageStyleSchemes,
} from './blueprints.js';
import { getAtPath } from './paths.js';
import { getSectionDefinition, samplePathsOf, validateComposition } from './registry.js';

const EMPTY_BRIEF: Brief = { offer: '', audience: '', phone: '' };
const FULL_BRIEF: Brief = {
  offer: 'Niềng răng trong suốt — tư vấn miễn phí tháng 11',
  audience: 'người đi làm 22–35 tuổi tại TP.HCM',
  phone: '0901 234 567',
};

function idGenerator(): () => string {
  let next = 0;
  return () => {
    next += 1;
    return `sec${String(next).padStart(8, '0')}`;
  };
}

function build(goal: PageGoal, brief: Brief, style: PageStyle = 'calm') {
  return buildCompositionFromGoal({
    goal,
    brief,
    style,
    siteName: 'Smile Care',
    newId: idGenerator(),
  });
}

function only(sections: readonly SectionInstance[], type: SectionType): SectionInstance {
  const matches = sections.filter((section) => section.type === type);
  const first = matches[0];
  if (matches.length !== 1 || !first) {
    throw new Error(`Expected exactly one "${type}" section, found ${matches.length}`);
  }
  return first;
}

const briefs = [
  { briefName: 'empty', brief: EMPTY_BRIEF },
  { briefName: 'full', brief: FULL_BRIEF },
];
const combinations = pageGoalIds.flatMap((goal) =>
  pageStyleIds.flatMap((style) => briefs.map((entry) => ({ goal, style, ...entry }))),
);

describe('goal and style definitions', () => {
  it('describes every goal with the copy of the onboarding board', () => {
    expect(Object.keys(goalDefinitions).sort()).toEqual([...pageGoalIds].sort());
    expect(goalDefinitions.lead.title).toBe('Thu lead tư vấn');
    expect(goalDefinitions.waitlist.description).toBe('Thu email trước khi ra mắt dịch vụ mới.');
    for (const goal of pageGoalIds) {
      expect(goalDefinitions[goal].icon).toMatch(/^M[0-9 .,MLHVCSQTAZmlhvcsqtaz-]+$/);
    }
  });

  it('labels every style in Vietnamese', () => {
    expect(pageStyles.calm.label).toBe('Nhẹ nhàng');
    expect(pageStyles.bold.label).toBe('Nổi bật');
    expect(pageStyles.minimal.label).toBe('Tối giản');
  });

  it('alternates the body schemes of a calm page and keeps the fixed ones', () => {
    expect(
      pageStyleSchemes('calm', [
        'navbar',
        'hero',
        'benefits',
        'testimonials',
        'faq',
        'cta_band',
        'footer',
      ]),
    ).toEqual(['light', 'soft', 'light', 'soft', 'light', 'brand', 'dark']);
    expect(pageStyleSchemes('bold', ['hero', 'benefits', 'testimonials', 'faq'])).toEqual([
      'brand',
      'light',
      'dark',
      'soft',
    ]);
  });
});

describe('buildCompositionFromGoal', () => {
  it.each(combinations)(
    'builds a valid page for $goal · $style · $briefName brief',
    ({ goal, style, brief }) => {
      const composition = build(goal, brief, style);
      expect(validateComposition(composition)).toEqual([]);
      expect(compositionSchema.safeParse(composition).success).toBe(true);
      expect(composition.sections[0]?.type).toBe('navbar');
      expect(composition.sections.at(-1)?.type).toBe('footer');
      const ids = composition.sections.map((section) => section.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const section of composition.sections) {
        expect(colorSchemeIds).toContain(section.colorScheme);
      }
    },
  );

  it.each(pageGoalIds)('follows the outline of "%s" section by section', (goal) => {
    const composition = build(goal, EMPTY_BRIEF);
    expect(
      composition.sections.map((section) => ({ type: section.type, variant: section.variant })),
    ).toEqual(goalOutline(goal).map(({ type, variant }) => ({ type, variant })));
  });

  it('applies the style rhythm to the color schemes', () => {
    const composition = build('lead', EMPTY_BRIEF, 'calm');
    expect(composition.sections.map((section) => section.colorScheme)).toEqual(
      pageStyleSchemes(
        'calm',
        composition.sections.map((section) => section.type),
      ),
    );
    expect(only(composition.sections, 'hero').colorScheme).toBe('soft');
    expect(only(composition.sections, 'cta_band').colorScheme).toBe('brand');
    expect(only(composition.sections, 'footer').colorScheme).toBe('dark');
    expect(only(build('lead', EMPTY_BRIEF, 'bold').sections, 'hero').colorScheme).toBe('brand');
  });

  it.each(pageGoalIds)('puts the brief values of "%s" into real content', (goal) => {
    const { sections } = build(goal, FULL_BRIEF);
    const hero = only(sections, 'hero');
    expect(hero.content.heading).toBe(FULL_BRIEF.offer);
    expect(hero.content.subheading).toMatch(/^Dành cho người đi làm 22–35 tuổi tại TP\.HCM\. \S/);
    expect(hero.samplePaths).not.toContain('heading');
    expect(hero.samplePaths).not.toContain('subheading');
    // Sample text the brief did not replace stays marked.
    expect(hero.samplePaths).toContain('eyebrow');
    expect(hero.samplePaths).toContain('primaryCta.label');

    const phoneLink = { kind: 'phone', phone: FULL_BRIEF.phone };
    expect(getAtPath(hero.content, 'primaryCta.link')).toEqual(phoneLink);
    expect(getAtPath(only(sections, 'navbar').content, 'cta.link')).toEqual(phoneLink);
    expect(getAtPath(only(sections, 'cta_band').content, 'cta.link')).toEqual(phoneLink);

    const footer = only(sections, 'footer');
    expect(footer.content.phone).toBe(FULL_BRIEF.phone);
    expect(footer.samplePaths).not.toContain('phone');
    expect(footer.samplePaths).toContain('address');
  });

  it.each(pageGoalIds)('keeps every text of "%s" marked as sample without a brief', (goal) => {
    const { sections } = build(goal, EMPTY_BRIEF);
    for (const section of sections) {
      expect(section.samplePaths).toEqual(samplePathsOf(section));
    }
    const hero = only(sections, 'hero');
    expect(hero.samplePaths).toEqual(expect.arrayContaining(['heading', 'subheading']));
    expect(getAtPath(hero.content, 'primaryCta.link')).toEqual({ kind: 'none' });
    expect(only(sections, 'footer').samplePaths).toContain('phone');
  });

  it('marks exactly the sample paths the brief did not fill', () => {
    for (const goal of pageGoalIds) {
      for (const section of build(goal, FULL_BRIEF).sections) {
        const filledByBrief =
          section.type === 'hero'
            ? ['heading', 'subheading']
            : section.type === 'footer'
              ? ['phone']
              : [];
        expect(section.samplePaths).toEqual(
          samplePathsOf(section).filter((path) => !filledByBrief.includes(path)),
        );
      }
    }
  });

  it('uses goal-specific sample copy', () => {
    const event = build('event', EMPTY_BRIEF);
    const questions = getAtPath(only(event.sections, 'faq').content, 'items.0.question');
    expect(questions).toBe('Sự kiện diễn ra ở đâu?');
    const lead = build('lead', EMPTY_BRIEF);
    expect(getAtPath(lead.sections[1]?.content, 'primaryCta.label')).toBe('Đặt lịch tư vấn');
    expect(getAtPath(lead.sections[2]?.content, 'heading')).toBe('Vì sao chọn Smile Care');
  });

  it('cuts an offer longer than the Hero heading allows', () => {
    const offer = `${'Ưu đãi niềng răng trong suốt '.repeat(4)}kèm quà tặng`;
    expect(offer.length).toBeGreaterThan(80);
    const hero = only(build('lead', { ...EMPTY_BRIEF, offer }).sections, 'hero');
    const heading = String(hero.content.heading);
    expect(heading.length).toBeLessThanOrEqual(80);
    expect(heading.length).toBeGreaterThan(40);
    expect(offer.startsWith(heading)).toBe(true);
    expect(heading).toBe(heading.trim());
  });

  it('cuts a long word-less offer at the field limit', () => {
    const offer = 'x'.repeat(120);
    const hero = only(build('promo', { ...EMPTY_BRIEF, offer }).sections, 'hero');
    expect(hero.content.heading).toBe('x'.repeat(80));
  });

  it('trims brief values and ignores blank ones', () => {
    const hero = only(
      build('lead', { offer: '   ', audience: '  khách văn phòng.  ', phone: ' ' }).sections,
      'hero',
    );
    expect(hero.samplePaths).toContain('heading');
    expect(hero.content.subheading).toMatch(/^Dành cho khách văn phòng\. /);
    expect(getAtPath(hero.content, 'primaryCta.link')).toEqual({ kind: 'none' });
  });
});

describe('goal outline and recommendations', () => {
  it.each(pageGoalIds)('starts "%s" with the navigation bar and ends with the footer', (goal) => {
    const outline = goalOutline(goal);
    expect(outline[0]?.type).toBe('navbar');
    expect(outline.at(-1)).toEqual({
      type: 'footer',
      variant: 'basic',
      label: 'Chân trang & liên hệ',
    });
    for (const item of outline) {
      expect(sectionTypes).toContain(item.type);
      expect(item.label.trim()).not.toBe('');
    }
  });

  it('labels the lead outline by role', () => {
    expect(goalOutline('lead').map((item) => item.label)).toEqual([
      'Thanh điều hướng + nút liên hệ',
      'Hero + nút đặt lịch',
      'Lợi ích chính',
      'Cảm nhận khách hàng',
      'Câu hỏi thường gặp',
      'Dải kêu gọi đặt lịch tư vấn',
      'Chân trang & liên hệ',
    ]);
  });

  it.each(pageGoalIds)('recommends exactly the sections in the outline of "%s"', (goal) => {
    const outline = goalOutline(goal);
    for (const type of sectionTypes) {
      for (const variant of getSectionDefinition(type).variants) {
        expect(isRecommendedFor(goal, type, variant.id)).toBe(
          outline.some((item) => item.type === type && item.variant === variant.id),
        );
      }
    }
    expect(isRecommendedFor(goal, 'hero', 'no-such-variant')).toBe(false);
  });
});
