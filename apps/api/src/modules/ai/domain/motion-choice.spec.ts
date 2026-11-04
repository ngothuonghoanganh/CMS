import type { SectionInstance, SectionType } from '@plp/contracts';
import { createSectionInstance, parseComposition } from '@plp/sections/schema';
import { describe, expect, it } from 'vitest';
import {
  buildMotionPrompt,
  changeablePositions,
  MAX_MOTION_OVERRIDES,
  motionJsonSchema,
  readMotionChoice,
  withMotionChoice,
} from './motion-choice.js';

let nextId = 0;
function section(type: SectionType, variant?: string): SectionInstance {
  nextId += 1;
  return createSectionInstance(type, variant, `mch${String(nextId).padStart(9, '0')}`);
}

/** Navigation, Hero, then sections that may move: cards, a process, figures, questions, footer. */
const sections = [
  section('navbar'),
  section('hero', 'split'),
  section('benefits', 'grid'),
  section('benefits', 'steps'),
  section('stats', 'row'),
  section('faq'),
  section('footer'),
];

const BRIEF = {
  product: 'Niềng răng trong suốt Invisalign',
  audience: 'Người đi làm 22–35 tuổi',
  goal: 'lead',
  differentiators: 'Bác sĩ nhiều năm kinh nghiệm chỉnh nha.',
  tone: 'professional',
  language: 'vi',
  existingContent: 'Trả góp 0% trong 12 tháng.',
} as const;

function answer(style: string, overrides: unknown[] = []): string {
  return JSON.stringify({ style, sections: overrides });
}

function override(section: string, change: Partial<Record<'enter' | 'order' | 'accent', string>>) {
  return { section, enter: 'page', order: 'page', accent: 'page', ...change };
}

function chosen(text: string) {
  const choice = readMotionChoice(text, sections);
  if (choice === null) {
    throw new Error('The answer was refused');
  }
  return {
    style: choice.motion.style,
    sections: Object.fromEntries(
      [...choice.sections].map(([id, motion]) => [
        sections.findIndex((s) => s.id === id) + 1,
        motion,
      ]),
    ),
  };
}

describe('the prompt of "AI chọn" (ADR-032)', () => {
  it('holds the brief and the sections’ types and variants, nothing else', () => {
    const { system, prompt } = buildMotionPrompt(BRIEF, sections);
    expect(prompt).toContain(BRIEF.product);
    expect(prompt).toContain(BRIEF.audience);
    expect(prompt).toContain(BRIEF.differentiators);
    expect(prompt).toContain('Tone: clear, professional and trustworthy');
    // Pasted content says nothing of motion.
    expect(prompt).not.toContain(BRIEF.existingContent);
    expect(prompt).toContain('2. Hero (hero, split): always shows at once, cannot change');
    expect(prompt).toContain(
      '4. Lợi ích (benefits, steps): laid out in rows; accents it can show: lines, steps',
    );
    expect(prompt).toContain('7. Chân trang (footer, basic): not laid out in rows; no accents');
    expect(system).toContain('at most 3 sections');
    // "AI chọn" asks for motion: no style that keeps the page still.
    const styles = system.split('\n').find((line) => line.startsWith('Styles: '));
    expect(styles).not.toContain('none');
  });

  it('asks for a style that moves and overrides of the sections that are not locked', () => {
    expect(changeablePositions(sections)).toEqual(['3', '4', '5', '6', '7']);
    const schema = motionJsonSchema(changeablePositions(sections));
    expect(schema).toMatchObject({
      type: 'object',
      required: ['style', 'sections'],
      properties: {
        style: { enum: ['subtle', 'smooth', 'lively', 'luxe', 'playful'] },
        sections: {
          maxItems: MAX_MOTION_OVERRIDES,
          items: {
            properties: {
              section: { enum: ['3', '4', '5', '6', '7'] },
              enter: { enum: ['page', 'none', 'fade', 'up', 'side', 'zoom', 'pop', 'reveal'] },
              order: { enum: ['page', 'together', 'stagger', 'rows'] },
              accent: { enum: ['page', 'lines', 'image', 'count', 'steps'] },
            },
          },
        },
      },
    });
    // A page of locked sections only has nothing to change.
    expect(motionJsonSchema([])).toMatchObject({
      properties: {
        sections: { maxItems: 0, items: { properties: { section: { type: 'string' } } } },
      },
    });
  });
});

describe('readMotionChoice', () => {
  it('reads the style and what sections change, as the editor would store it', () => {
    expect(
      chosen(
        answer('subtle', [
          override('5', { accent: 'count' }),
          override('6', { enter: 'zoom', order: 'stagger' }),
        ]),
      ),
    ).toEqual({
      style: 'subtle',
      sections: { 5: { accents: { count: true } }, 6: { enter: 'zoom', order: 'stagger' } },
    });
    // A code fence and a section given as a number are fine.
    expect(
      chosen(
        `\`\`\`json\n${answer('lively', [{ ...override('3', { enter: 'pop' }), section: 3 }])}\n\`\`\``,
      ),
    ).toEqual({
      style: 'lively',
      sections: { 3: { enter: 'pop' } },
    });
  });

  it('drops what a section cannot do or what changes nothing', () => {
    expect(
      chosen(
        answer('smooth', [
          // Locked: the navigation bar and the Hero always show at once.
          override('1', { enter: 'pop' }),
          override('2', { accent: 'image' }),
          // Questions have no figures; figures already count up in "Mượt mà".
          override('6', { accent: 'count' }),
          override('5', { accent: 'count' }),
          // What the style does already; rows without rows are one after another, as the style.
          override('3', { enter: 'up', order: 'stagger' }),
          override('6', { order: 'rows' }),
          // A process whose steps connect enters step by step.
          override('4', { order: 'together' }),
          // No such section.
          override('9', { enter: 'pop' }),
          override('x', { enter: 'pop' }),
        ]),
      ),
    ).toEqual({ style: 'smooth', sections: {} });
    // Without a style that enters row by row, "Theo hàng" of a section without rows is kept as
    // one after another; a section that shows at once needs nothing else.
    expect(
      chosen(
        answer('subtle', [
          override('6', { order: 'rows' }),
          override('3', { enter: 'none', accent: 'lines' }),
        ]),
      ),
    ).toEqual({ style: 'subtle', sections: { 6: { order: 'stagger' }, 3: { enter: 'none' } } });
  });

  it('takes a section’s first answer only, even one that changes nothing', () => {
    expect(
      chosen(
        answer('smooth', [override('6', { accent: 'count' }), override('6', { enter: 'pop' })]),
      ),
    ).toEqual({ style: 'smooth', sections: {} });
  });

  it('keeps at most three sections, the first answer for each, and skips malformed ones', () => {
    expect(
      chosen(
        answer('luxe', [
          override('3', { enter: 'pop' }),
          override('3', { enter: 'zoom' }),
          override('4', { enter: 'bounce' }),
          override('5', { enter: 'zoom' }),
          override('6', { enter: 'fade' }),
          override('7', { enter: 'pop' }),
        ]),
      ),
    ).toEqual({
      style: 'luxe',
      sections: { 3: { enter: 'pop' }, 5: { enter: 'zoom' }, 6: { enter: 'fade' } },
    });
  });

  it('refuses an answer without a style that moves', () => {
    for (const text of [
      'Mượt mà',
      '[]',
      answer('none'),
      answer('bouncy'),
      JSON.stringify({ sections: [] }),
    ]) {
      expect(readMotionChoice(text, sections), text).toBeNull();
    }
    // No overrides at all is a choice.
    expect(chosen(JSON.stringify({ style: 'playful' }))).toEqual({
      style: 'playful',
      sections: {},
    });
  });
});

describe('withMotionChoice', () => {
  it('gives the page its style and the chosen sections their own motion, as the registry keeps it', () => {
    const choice = readMotionChoice(answer('lively', [override('5', { enter: 'zoom' })]), sections);
    if (choice === null) {
      throw new Error('The answer was refused');
    }
    const parsed = parseComposition(withMotionChoice({ version: 1, sections }, choice));
    if (!parsed.success) {
      throw new Error(JSON.stringify(parsed.issues));
    }
    expect(parsed.composition.motion).toEqual({
      style: 'lively',
      level: 'mid',
      accents: {},
      reduceOnMobile: false,
    });
    expect(parsed.composition.sections.map((item) => item.motion)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      { enter: 'zoom' },
      undefined,
      undefined,
    ]);
  });
});
