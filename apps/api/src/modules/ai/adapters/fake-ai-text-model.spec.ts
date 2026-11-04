import { sectionTypes } from '@plp/contracts';
import { createSectionInstance, getSectionDefinition } from '@plp/sections/schema';
import { describe, expect, it } from 'vitest';
import { AiError } from '../ai-text-model.js';
import {
  buildMotionPrompt,
  changeablePositions,
  MOTION_SCHEMA_NAME,
  motionJsonSchema,
  readMotionChoice,
} from '../domain/motion-choice.js';
import { buildSectionPrompt } from '../domain/prompts.js';
import {
  applySectionCopy,
  copyJsonSchema,
  copyPlanOf,
  isEmptyPlan,
  parseSectionCopy,
} from '../domain/section-copy.js';
import { FAKE_MOTION_ENTER, FAKE_MOTION_STYLE, FakeAiTextModel } from './fake-ai-text-model.js';

const CONTEXT = {
  siteName: 'Nha khoa Smile Care',
  brief: {
    product: 'Niềng răng trong suốt',
    audience: 'Người đi làm ở TP.HCM',
    goal: 'lead',
    differentiators: 'Bác sĩ chỉnh nha giàu kinh nghiệm.',
    tone: 'friendly',
    language: 'vi',
    existingContent: '',
  },
  outline: ['Hero'],
} as const;

/** Every variant of every section the AI writes something in. */
const VARIANTS = sectionTypes.flatMap((type) =>
  getSectionDefinition(type).variants.map((variant) => [type, variant.id] as const),
);

describe('the fake AI of tests and E2E (ADR-031)', () => {
  it.each(VARIANTS)('answers %s (%s) with copy the section takes', async (type, variant) => {
    const section = createSectionInstance(type, variant, 'abcdefgh1234');
    const plan = copyPlanOf(section);
    if (isEmptyPlan(plan)) {
      return;
    }
    const fake = new FakeAiTextModel();
    const { system, prompt } = buildSectionPrompt(CONTEXT, section, plan);
    const result = await fake.generate({
      system,
      prompt,
      schema: { name: `section_${type}`, schema: copyJsonSchema(plan) },
      maxOutputTokens: 1000,
      signal: new AbortController().signal,
    });
    const parsed = parseSectionCopy(plan, result.text);
    if (!parsed.ok) {
      throw new Error(JSON.stringify(parsed.issues));
    }
    const written = applySectionCopy(section, plan, parsed.copy);
    expect(getSectionDefinition(type).contentSchema.safeParse(written.content).success).toBe(true);
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]).toMatchObject({ system, prompt, schema: { name: `section_${type}` } });
  });

  it('heads the Hero with the product and marks its figure for review', async () => {
    const hero = createSectionInstance('hero', 'split', 'abcdefgh1234');
    const plan = copyPlanOf(hero);
    const result = await new FakeAiTextModel().generate({
      ...buildSectionPrompt(CONTEXT, hero, plan),
      schema: { name: 'section_hero', schema: copyJsonSchema(plan) },
      maxOutputTokens: 1000,
      signal: new AbortController().signal,
    });
    const parsed = parseSectionCopy(plan, result.text);
    expect(parsed.ok && parsed.copy.texts.get('heading')).toBe('Niềng răng trong suốt');
    expect(parsed.ok && parsed.copy.flagged).toEqual(['subheading']);
  });

  it('chooses "Mượt mà" and has the first section it may change zoom in (ADR-032)', async () => {
    const sections = [
      createSectionInstance('navbar', undefined, 'abcdefgh0001'),
      createSectionInstance('hero', 'split', 'abcdefgh0002'),
      createSectionInstance('benefits', 'grid', 'abcdefgh0003'),
      createSectionInstance('footer', undefined, 'abcdefgh0004'),
    ];
    const fake = new FakeAiTextModel();
    const ask = (positions: readonly string[]) =>
      fake.generate({
        ...buildMotionPrompt(CONTEXT.brief, sections),
        schema: { name: MOTION_SCHEMA_NAME, schema: motionJsonSchema(positions) },
        maxOutputTokens: 400,
        signal: new AbortController().signal,
      });
    const choice = readMotionChoice((await ask(changeablePositions(sections))).text, sections);
    expect(choice?.motion.style).toBe(FAKE_MOTION_STYLE);
    expect([...(choice?.sections ?? [])]).toEqual([['abcdefgh0003', { enter: FAKE_MOTION_ENTER }]]);
    // Nothing the AI may change: the style alone.
    expect(JSON.parse((await ask([])).text)).toEqual({ style: FAKE_MOTION_STYLE, sections: [] });
  });

  it('lets a test answer in its place, and refuses a cancelled request', async () => {
    const fake = new FakeAiTextModel();
    fake.respondWith(() => ({
      text: 'không phải JSON',
      usage: { inputTokens: null, outputTokens: null },
      truncated: false,
    }));
    const hero = createSectionInstance('hero', 'split', 'abcdefgh1234');
    const plan = copyPlanOf(hero);
    const ask = (signal: AbortSignal) =>
      fake.generate({
        ...buildSectionPrompt(CONTEXT, hero, plan),
        schema: { name: 'section_hero', schema: copyJsonSchema(plan) },
        maxOutputTokens: 1000,
        signal,
      });
    expect((await ask(new AbortController().signal)).text).toBe('không phải JSON');
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(ask(cancelled.signal)).rejects.toBeInstanceOf(AiError);
    fake.reset();
    expect(fake.requests).toEqual([]);
  });
});
