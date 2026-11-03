import type { SectionInstance } from '@plp/contracts';
import { createSectionInstance, getAtPath, setAtPath } from '@plp/sections/schema';
import { describe, expect, it } from 'vitest';
import {
  applySectionCopy,
  copyJsonSchema,
  copyPlanOf,
  currentCopyOf,
  isEmptyPlan,
  parseSectionCopy,
  type SectionCopy,
} from './section-copy.js';

const ID = 'abcdefgh1234';

function section(type: SectionInstance['type'], variant?: string): SectionInstance {
  return createSectionInstance(type, variant, ID);
}

function keysOf(plan: ReturnType<typeof copyPlanOf>): string[] {
  return [
    ...plan.fields.map((slot) => slot.path),
    ...plan.lists.flatMap((list) => list.fields.map((slot) => `${list.key}.*.${slot.path}`)),
  ];
}

function parsed(plan: ReturnType<typeof copyPlanOf>, answer: unknown): SectionCopy {
  const result = parseSectionCopy(plan, JSON.stringify(answer));
  if (!result.ok) {
    throw new Error(JSON.stringify(result.issues));
  }
  return result.copy;
}

const HERO_ANSWER = {
  eyebrow: 'Tư vấn miễn phí',
  heading: 'Niềng răng trong suốt cho người bận rộn',
  subheading: 'Trả góp 0% trong 12 tháng, bác sĩ theo dõi suốt liệu trình.',
  primaryCta: 'Nhận lịch tư vấn',
  review: [],
};

describe('what the AI may write in a section (ADR-031)', () => {
  it('writes the text and the labels of buttons in use, never links, images or variants', () => {
    const hero = section('hero', 'split');
    const plan = copyPlanOf(hero);
    // The secondary button has no label in the sample: it stays unused.
    expect(keysOf(plan)).toEqual(['eyebrow', 'heading', 'subheading', 'primaryCta.label']);
    expect(plan.fields.find((slot) => slot.key === 'heading')).toMatchObject({
      maxLength: 80,
      required: true,
    });
    // A field the variant hides is not written.
    const centered = setAtPath(section('hero', 'centered'), 'content.secondaryCta.label', 'Xem');
    expect(keysOf(copyPlanOf(centered))).not.toContain('secondaryCta.label');
  });

  it('leaves the facts only the business knows to the business', () => {
    expect(keysOf(copyPlanOf(section('navbar')))).toEqual(['cta.label']);
    expect(isEmptyPlan(copyPlanOf(section('footer')))).toBe(true);
    // Real customers' words and names are never made up.
    expect(keysOf(copyPlanOf(section('testimonials', 'cards')))).toEqual(['heading']);
    expect(keysOf(copyPlanOf(section('before_after')))).toEqual(['heading', 'note']);
    // Where a button calls is a phone number: only its label is the AI's.
    expect(keysOf(copyPlanOf(section('quick_contact')))).toEqual([
      'heading',
      'text',
      'call.label',
      'zalo.label',
    ]);
    expect(keysOf(copyPlanOf(section('logos')))).toEqual(['heading']);
    // A figure is a fact: the AI says what it counts, never the figure (ADR-032).
    expect(keysOf(copyPlanOf(section('stats')))).toEqual(['heading', 'items.*.label']);
  });

  it('writes list items within the variant’s counts', () => {
    const grid = copyPlanOf(section('benefits', 'grid'));
    expect(keysOf(grid)).toEqual(['heading', 'intro', 'items.*.title', 'items.*.description']);
    expect(grid.lists[0]).toMatchObject({ key: 'items', min: 3, max: 6 });
    expect(copyPlanOf(section('benefits', 'steps')).lists[0]).toMatchObject({ min: 3, max: 5 });
    expect(copyPlanOf(section('faq')).lists[0]).toMatchObject({ min: 1, max: 12 });
  });

  it('asks for exactly those fields as JSON', () => {
    const schema = copyJsonSchema(copyPlanOf(section('benefits', 'grid')));
    expect(schema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['heading', 'intro', 'items', 'review'],
      properties: {
        heading: { type: 'string', minLength: 1, maxLength: 80 },
        intro: { type: 'string', maxLength: 240 },
        items: {
          type: 'array',
          minItems: 3,
          maxItems: 6,
          items: { required: ['title', 'description'], additionalProperties: false },
        },
        review: { type: 'array', items: { type: 'string' } },
      },
    });
  });

  it('shows the AI the section’s current text only', () => {
    const hero = setAtPath(section('hero'), 'content.image', {
      assetId: '64b000000000000000000001',
      alt: 'Ảnh bác sĩ Nguyễn Văn A',
      decorative: false,
    });
    const current = currentCopyOf(hero, copyPlanOf(hero));
    expect(Object.keys(current)).toEqual(['eyebrow', 'heading', 'subheading', 'primaryCta']);
    expect(JSON.stringify(current)).not.toContain('Nguyễn Văn A');
  });
});

describe('reading the AI’s answer as untrusted input', () => {
  const hero = section('hero', 'split');
  const plan = copyPlanOf(hero);

  it('takes JSON, in a code fence too, and tidies whitespace', () => {
    const fenced = parseSectionCopy(
      plan,
      `\`\`\`json\n${JSON.stringify({ ...HERO_ANSWER, heading: '  Niềng   răng\ntrong suốt ' })}\n\`\`\``,
    );
    expect(fenced.ok && fenced.copy.texts.get('heading')).toBe('Niềng răng trong suốt');
  });

  it('refuses what is not a usable answer, saying why without quoting it', () => {
    const issues = (answer: unknown) => {
      const result = parseSectionCopy(
        plan,
        typeof answer === 'string' ? answer : JSON.stringify(answer),
      );
      return result.ok ? [] : result.issues;
    };
    expect(issues('Tiêu đề: Niềng răng')).toEqual([{ path: '', message: 'is not valid JSON' }]);
    expect(issues(['a'])).toEqual([{ path: '', message: 'must be a JSON object' }]);
    expect(issues({ ...HERO_ANSWER, heading: 'x'.repeat(81) })).toEqual([
      { path: 'heading', message: 'is longer than 80 characters' },
    ]);
    expect(issues({ ...HERO_ANSWER, heading: '' })).toEqual([
      { path: 'heading', message: 'must not be empty' },
    ]);
    expect(issues({ ...HERO_ANSWER, subheading: 'Giảm <b>30%</b>' })).toEqual([
      { path: 'subheading', message: 'must be plain text, without HTML' },
    ]);
    expect(issues({ ...HERO_ANSWER, subheading: 'Không ảnh hưởng外观' })).toEqual([
      { path: 'subheading', message: 'contains characters of another language' },
    ]);
    // A button's target is not the AI's to write: an object where the label goes is refused.
    expect(
      issues({ ...HERO_ANSWER, primaryCta: { label: 'Gọi', link: { kind: 'phone', phone: '1' } } }),
    ).toEqual([{ path: 'primaryCta', message: 'must be a string' }]);
    const faqPlan = copyPlanOf(section('faq'));
    expect(
      parseSectionCopy(faqPlan, JSON.stringify({ heading: 'Hỏi đáp', items: [], review: [] })),
    ).toEqual({
      ok: false,
      issues: [{ path: 'items', message: 'must have 1 to 12 items, not 0' }],
    });
  });

  it('keeps the review marks of fields it wrote, buttons by their label', () => {
    const copy = parsed(plan, {
      ...HERO_ANSWER,
      review: ['subheading', 'primaryCta', 'image', 'nope', 3],
    });
    expect(copy.flagged).toEqual(['subheading', 'primaryCta.label']);
  });
});

describe('putting the answer in the section', () => {
  it('writes the text, keeps links and marks what it did not write as sample', () => {
    const hero = setAtPath(section('hero', 'split'), 'content.primaryCta.link', {
      kind: 'section',
      sectionId: 'form00000001',
    });
    const plan = copyPlanOf(hero);
    const written = applySectionCopy(hero, plan, parsed(plan, HERO_ANSWER));
    expect(written.content).toMatchObject({
      heading: HERO_ANSWER.heading,
      primaryCta: {
        label: 'Nhận lịch tư vấn',
        link: { kind: 'section', sectionId: 'form00000001' },
      },
      image: hero.content['image'],
    });
    expect(written.samplePaths).toEqual([]);
    // A figure is a sentence to check even when the AI does not say so.
    expect(written.reviewPaths).toEqual(['subheading']);
  });

  it('marks what the AI flagged and every figure it wrote', () => {
    const hero = section('hero', 'split');
    const plan = copyPlanOf(hero);
    const written = applySectionCopy(
      hero,
      plan,
      parsed(plan, {
        ...HERO_ANSWER,
        subheading: 'Bác sĩ chỉnh nha giàu kinh nghiệm.',
        heading: 'Cam kết đẹp sau 6 tháng',
        review: ['subheading'],
      }),
    );
    expect(written.reviewPaths).toEqual(['subheading', 'heading']);
  });

  it('grows and shrinks lists, new items starting from the field’s own', () => {
    const benefits = section('benefits', 'grid');
    const plan = copyPlanOf(benefits);
    const item = (title: string) => ({ title, description: `Mô tả ${title}.` });
    const grown = applySectionCopy(
      benefits,
      plan,
      parsed(plan, {
        heading: 'Vì sao chọn chúng tôi',
        intro: '',
        items: ['Một', 'Hai', 'Ba', 'Bốn', 'Năm'].map(item),
        review: [],
      }),
    );
    const items = getAtPath(grown.content, 'items') as Record<string, unknown>[];
    expect(items.map((entry) => entry['title'])).toEqual(['Một', 'Hai', 'Ba', 'Bốn', 'Năm']);
    // Icons are not the AI's: the sample's stay, new items take the field's default.
    expect(items.map((entry) => entry['icon'])).toEqual([
      'sparkles',
      'shield',
      'clock',
      'check',
      'check',
    ]);
    expect(grown.samplePaths).toEqual([]);

    const faq = section('faq');
    const faqPlan = copyPlanOf(faq);
    const shrunk = applySectionCopy(
      faq,
      faqPlan,
      parsed(faqPlan, {
        heading: 'Hỏi đáp',
        items: [{ question: 'Có trả góp không?', answer: 'Có, hỏi chúng tôi để biết thêm.' }],
        review: ['items.0.answer'],
      }),
    );
    expect(getAtPath(shrunk.content, 'items')).toHaveLength(1);
    expect(shrunk.reviewPaths).toEqual(['items.0.answer']);
  });

  it('writes what each figure counts and keeps the figures the business entered', () => {
    const stats = setAtPath(section('stats'), 'content.items.0.value', '8.000+');
    const plan = copyPlanOf(stats);
    const written = applySectionCopy(
      stats,
      plan,
      parsed(plan, {
        heading: 'Con số nói thay chúng tôi',
        items: [{ label: 'khách hàng đã tin chọn' }, { label: 'năm kinh nghiệm' }],
        review: [],
      }),
    );
    expect(getAtPath(written.content, 'items')).toEqual([
      { value: '8.000+', label: 'khách hàng đã tin chọn' },
      { value: '', label: 'năm kinh nghiệm' },
    ]);
  });

  it('keeps the sample marks of what the AI never writes', () => {
    const cards = section('testimonials', 'cards');
    const plan = copyPlanOf(cards);
    const written = applySectionCopy(
      cards,
      plan,
      parsed(plan, { heading: 'Khách hàng nói gì', review: [] }),
    );
    expect(written.samplePaths).not.toContain('heading');
    expect(written.samplePaths).toContain('items.0.quote');
    expect(written.samplePaths).toContain('items.0.name');
  });
});
