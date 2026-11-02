import { type AiScopeSection, aiSuggestionRequestSchema } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import {
  type AiSuggestionValues,
  buildSuggestionPrompt,
  changesOf,
  checkedCopy,
  languageOf,
  planSuggestion,
  sectionFromText,
  type SectionUnit,
  type SuggestionUnit,
} from './assistant.js';
import { copyJsonSchema, readSectionCopy } from './section-copy.js';

const HERO: AiScopeSection = {
  id: 'herosection01',
  type: 'hero',
  variant: 'split',
  texts: {
    eyebrow: 'Nha khoa Smile Care',
    heading: 'Niềng răng trong suốt Invisalign',
    subheading: 'Ưu đãi tháng 11 cho khách đăng ký sớm.',
    'primaryCta.label': 'Đặt lịch ngay',
  },
};

const FAQ: AiScopeSection = {
  id: 'faqsection001',
  type: 'faq',
  variant: 'accordion',
  texts: {
    heading: 'Câu hỏi thường gặp',
    'items.0.question': 'Niềng răng có đau không?',
    'items.0.answer': 'Hơi ê vài ngày đầu.',
    'items.1.question': 'Mất bao lâu?',
    'items.1.answer': 'Tùy từng người.',
  },
};

const FOOTER: AiScopeSection = { id: 'footersect001', type: 'footer', variant: 'basic', texts: {} };

function request(input: Record<string, unknown>): AiSuggestionValues {
  return aiSuggestionRequestSchema.parse(input);
}

function planned(input: Record<string, unknown>) {
  const result = planSuggestion(request(input));
  if (!result.ok) {
    throw new Error(JSON.stringify(result.issues));
  }
  return result.plan;
}

function issuesOf(input: Record<string, unknown>) {
  const result = planSuggestion(request(input));
  return result.ok ? [] : result.issues.map((issue) => [issue.path.join('.'), issue.code]);
}

function onlySection(unit: SuggestionUnit | undefined): SectionUnit {
  if (unit?.kind !== 'section') {
    throw new Error('Expected a section unit');
  }
  return unit;
}

describe('reading the scope’s text the editor sent (ADR-031)', () => {
  it('rebuilds the section with the registry, lists at the editor’s length', () => {
    const rebuilt = sectionFromText(FAQ, 0);
    if (!rebuilt.ok) {
      throw new Error(JSON.stringify(rebuilt.issues));
    }
    expect(rebuilt.section.content['items']).toEqual([
      { question: 'Niềng răng có đau không?', answer: 'Hơi ê vài ngày đầu.' },
      { question: 'Mất bao lâu?', answer: 'Tùy từng người.' },
    ]);
    // A button the editor did not send is not in use, whatever the sample says.
    const hero = sectionFromText(HERO, 0);
    expect(hero.ok && hero.section.content['secondaryCta']).toMatchObject({ label: '' });
  });

  it('refuses every path the AI may not write', () => {
    for (const [section, path] of [
      [HERO, 'primaryCta.link'],
      [HERO, 'image.alt'],
      [HERO, 'secondaryCta.label'],
      [{ ...FOOTER, texts: {} }, 'phone'],
      [{ id: 'testimonial01', type: 'testimonials', variant: 'cards', texts: {} }, 'items.0.quote'],
      [{ id: 'navbarsect001', type: 'navbar', variant: 'logo-cta', texts: {} }, 'brandText'],
    ] as const) {
      const sent = { ...section, texts: { ...section.texts, [path]: 'chữ' } };
      // An unused button is refused too: its label would publish a button leading nowhere.
      const value = path === 'secondaryCta.label' ? '' : 'chữ';
      const result = sectionFromText({ ...sent, texts: { ...sent.texts, [path]: value } }, 2);
      expect(result.ok ? [] : result.issues.map((issue) => issue.path.join('.'))).toEqual([
        `sections.2.texts.${path}`,
      ]);
    }
  });

  it('holds the text to the registry’s limits, and the variant to the section’s', () => {
    const long = sectionFromText({ ...HERO, texts: { ...HERO.texts, heading: 'a'.repeat(81) } }, 0);
    expect(long.ok ? [] : long.issues.map((issue) => issue.path.join('.'))).toEqual([
      'sections.0.texts.heading',
    ]);
    const variant = sectionFromText({ ...HERO, variant: 'nope' }, 1);
    expect(variant.ok ? [] : variant.issues[0]).toMatchObject({
      path: ['sections', 1, 'variant'],
      code: 'invalid_variant',
    });
    const gap = sectionFromText(
      { ...FAQ, texts: { 'items.0.question': 'Hỏi?', 'items.2.question': 'Hỏi nữa?' } },
      0,
    );
    expect(gap.ok ? null : gap.issues[0]?.code).toBe('invalid_list');
  });
});

describe('what a suggestion asks the AI for', () => {
  it('asks for one field of “Đoạn chữ”', () => {
    const plan = planned({
      scope: { kind: 'field', sectionId: FAQ.id, path: 'items.1.answer' },
      action: 'rewrite',
      sections: [FAQ],
    });
    const unit = onlySection(plan.units[0]);
    expect(plan.units).toHaveLength(1);
    expect(unit.paths).toEqual(['items.1.answer']);
    expect(unit.plan.fields).toMatchObject([
      { key: 'text', path: 'items.1.answer', maxLength: 600 },
    ]);
    expect(unit.plan.lists).toEqual([]);
  });

  it('asks for a section’s text with its lists at their length', () => {
    const unit = onlySection(
      planned({ scope: { kind: 'section', sectionId: FAQ.id }, action: 'shorten', sections: [FAQ] })
        .units[0],
    );
    expect(unit.paths).toEqual([
      'heading',
      'items.0.question',
      'items.0.answer',
      'items.1.question',
      'items.1.answer',
    ]);
    expect(copyJsonSchema(unit.plan)).toMatchObject({
      properties: { items: { type: 'array', minItems: 2, maxItems: 2 } },
    });
  });

  it('asks for the headings or the buttons only, when the action says so', () => {
    const scope = { kind: 'section', sectionId: HERO.id };
    expect(
      onlySection(planned({ scope, action: 'suggest_heading', sections: [HERO] }).units[0]).paths,
    ).toEqual(['heading']);
    expect(
      onlySection(planned({ scope, action: 'suggest_cta', sections: [HERO] }).units[0]).paths,
    ).toEqual(['primaryCta.label']);
    expect(
      issuesOf({
        scope: { kind: 'field', sectionId: HERO.id, path: 'subheading' },
        action: 'suggest_heading',
        sections: [HERO],
      }),
    ).toEqual([['action', 'nothing_to_write']]);
  });

  it('asks for every section of the page that has text, one request each', () => {
    const plan = planned({
      scope: { kind: 'page' },
      action: 'rewrite',
      sections: [HERO, FAQ, FOOTER],
    });
    expect(plan.units.map((unit) => onlySection(unit).section.id)).toEqual([HERO.id, FAQ.id]);
    expect(issuesOf({ scope: { kind: 'page' }, action: 'rewrite', sections: [FOOTER] })).toEqual([
      ['action', 'nothing_to_write'],
    ]);
  });

  it('asks for the SEO title and description from the page’s text', () => {
    const plan = planned({
      scope: { kind: 'page' },
      action: 'suggest_seo',
      sections: [HERO, FAQ],
      seo: { title: '', description: 'Mô tả cũ' },
    });
    const [unit] = plan.units;
    if (unit?.kind !== 'seo') {
      throw new Error('Expected the SEO unit');
    }
    expect(unit.paths).toEqual(['title', 'description']);
    // Asked for the lengths search engines show, held to the draft's own limits.
    expect(unit.plan.fields.map((slot) => slot.maxLength)).toEqual([60, 160]);
    expect(unit.parsePlan.fields.map((slot) => slot.maxLength)).toEqual([200, 400]);
    expect(unit.pageText).toContain('Hero: Niềng răng trong suốt Invisalign');
    expect(unit.pageText).toContain('Câu hỏi thường gặp: Mất bao lâu?');
    expect(unit.current.get('description')).toBe('Mô tả cũ');
  });

  it('refuses sections that are not the scope’s, and a whole-page section write', () => {
    expect(
      issuesOf({
        scope: { kind: 'section', sectionId: HERO.id },
        action: 'rewrite',
        sections: [FAQ],
      }),
    ).toEqual([['sections', 'scope_mismatch']]);
    expect(
      issuesOf({ scope: { kind: 'page' }, action: 'write_section', sections: [HERO] }),
    ).toEqual([['scope', 'scope_mismatch']]);
    expect(
      issuesOf({
        scope: { kind: 'field', sectionId: HERO.id, path: 'primaryCta.link' },
        action: 'rewrite',
        sections: [HERO],
      }),
    ).toEqual([['scope.path', 'not_writable']]);
    expect(
      issuesOf({ scope: { kind: 'page' }, action: 'rewrite', sections: [HERO, HERO] }),
    ).toEqual([['sections.1.id', 'duplicate']]);
  });

  it('writes in the language of the scope', () => {
    expect(languageOf(['Niềng răng trong suốt'])).toBe('vi');
    expect(languageOf(['Clear aligners for busy people', 'Book now'])).toBe('en');
    expect(languageOf(['', '2026'])).toBe('vi');
  });
});

describe('the prompt of a suggestion', () => {
  it('holds the site, the page, the task, the request and the scope’s text only', () => {
    const plan = planned({
      scope: { kind: 'section', sectionId: HERO.id },
      action: 'change_tone',
      tone: 'professional',
      instruction: 'nhấn mạnh trả góp 0%',
      sections: [HERO],
    });
    const unit = onlySection(plan.units[0]);
    const { system, prompt } = buildSuggestionPrompt(
      { siteName: 'Nha khoa Smile Care', pageTitle: 'Niềng răng trả góp' },
      unit,
      { action: 'change_tone', tone: 'professional', instruction: 'nhấn mạnh trả góp 0%' },
      plan.language,
    );
    expect(system).toContain('Write in Vietnamese, with full diacritics.');
    for (const line of [
      'Site: Nha khoa Smile Care',
      'Page: Niềng răng trả góp',
      'Section type: hero',
      'clear, professional and trustworthy',
      'Request from the user: nhấn mạnh trả góp 0%',
      '- primaryCta: Nút chính (chữ trên nút), required, at most 40 characters',
      '"heading":"Niềng răng trong suốt Invisalign"',
    ]) {
      expect(prompt).toContain(line);
    }
    // What the section leads to is never the AI's.
    expect(prompt).not.toMatch(/link|https?:|zalo|tel:/i);
  });
});

describe('the changes of an answer', () => {
  const unit = onlySection(
    planned({ scope: { kind: 'section', sectionId: HERO.id }, action: 'rewrite', sections: [HERO] })
      .units[0],
  );

  it('lists new text, leaves out unchanged text and marks what to check', () => {
    const { copy, issues } = readSectionCopy(
      unit.parsePlan,
      JSON.stringify({
        eyebrow: 'Nha khoa Smile Care',
        heading: 'Niềng răng không ai nhận ra',
        subheading: 'Giảm 3 triệu khi đăng ký trước 30/11.',
        primaryCta: 'Nhận lịch tư vấn',
        review: ['primaryCta'],
      }),
    );
    expect(issues).toEqual([]);
    expect(changesOf(unit, copy, 'ai_invalid_output')).toEqual([
      {
        status: 'ok',
        sectionId: HERO.id,
        path: 'heading',
        before: 'Niềng răng trong suốt Invisalign',
        after: 'Niềng răng không ai nhận ra',
        review: false,
      },
      // A figure is checked, flagged or not.
      expect.objectContaining({ path: 'subheading', review: true }),
      expect.objectContaining({
        path: 'primaryCta.label',
        after: 'Nhận lịch tư vấn',
        review: true,
      }),
    ]);
  });

  it('marks the fields the AI did not write usably', () => {
    const { copy, issues } = readSectionCopy(
      unit.parsePlan,
      JSON.stringify({
        eyebrow: 'Mới',
        heading: 'a'.repeat(200),
        subheading: '<b>Ưu đãi</b>',
        // As it was, whitespace aside: no change.
        primaryCta: ' Đặt lịch  ngay ',
        review: [],
      }),
    );
    expect(issues.map((item) => item.path)).toEqual(['heading', 'subheading']);
    expect(changesOf(unit, copy, 'ai_invalid_output')).toEqual([
      expect.objectContaining({ status: 'ok', path: 'eyebrow', after: 'Mới' }),
      expect.objectContaining({ status: 'failed', path: 'heading', failure: 'ai_invalid_output' }),
      expect.objectContaining({ status: 'failed', path: 'subheading' }),
    ]);
  });

  it('takes out what the registry refuses', () => {
    const { copy, refused } = checkedCopy(unit, {
      texts: new Map([
        ['heading', 'b'.repeat(81)],
        ['eyebrow', 'Mới'],
      ]),
      itemCounts: new Map(),
      flagged: ['heading'],
    });
    expect(refused).toEqual(['heading']);
    expect([...copy.texts.keys()]).toEqual(['eyebrow']);
    expect(copy.flagged).toEqual([]);
  });
});
