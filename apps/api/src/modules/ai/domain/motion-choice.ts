import {
  type AiBrief,
  type AiTone,
  type Composition,
  DEFAULT_PAGE_MOTION,
  type MotionAccent,
  motionAccentIds,
  type MotionEnter,
  motionEnterIds,
  type MotionOrder,
  motionOrderIds,
  type MotionStyle,
  motionStyleIds,
  type PageMotion,
  type SectionInstance,
  type SectionMotion,
} from '@plp/contracts';
import {
  getSectionDefinition,
  goalDefinitions,
  isMotionLocked,
  MOTION_STYLES,
  motionCapabilityOf,
  pageAccentOn,
  storedSectionMotion,
} from '@plp/sections/schema';
import { z } from 'zod';
import type { JsonSchema } from '../ai-text-model.js';
import type { SectionPrompt } from './prompts.js';

/**
 * "AI chọn" of the structure step (ADR-031, ADR-032): after the sections are written, the AI picks
 * the page's motion style and at most a few sections that move their own way. It is told the brief
 * and the sections' types and variants, nothing else. Its answer is untrusted: the style must be
 * one that moves, and what a section may not do (a locked section, an accent without content,
 * "Theo hàng" without rows) is dropped. Pure functions, unit-tested.
 */

export const MOTION_SCHEMA_NAME = 'page_motion';
export const MAX_MOTION_OVERRIDES = 3;
/** A style and three short overrides; a runaway answer is cut. */
export const MOTION_MAX_OUTPUT_TOKENS = 400;

type MovingStyle = Exclude<MotionStyle, 'none'>;

/** "AI chọn" asks for motion: the AI never answers "Không hiệu ứng" for the whole page. */
const MOVING_STYLES = motionStyleIds.filter((style): style is MovingStyle => style !== 'none');

/** What a section answer keeps of the page style. */
const FOLLOW = 'page';

const STYLE_TEXT: Readonly<Record<MovingStyle, string>> = {
  subtle:
    'sections fade in, every part at once; discreet. Suits medical, finance, professional services.',
  smooth:
    'sections slide up, parts one after another; headings line by line, figures count up. Suits most landing pages.',
  lively:
    'text slides in from the left and images from the right, at a quick pace; figures count up, steps connect. Suits events, courses, sports.',
  luxe: 'content is revealed slowly, images settle into their frame, headings line by line. Suits real estate, spas, fashion.',
  playful:
    'cards pop up row by row with a light bounce; figures count up, steps connect. Suits food, promotions, children.',
};

const ENTER_TEXT: Readonly<Record<MotionEnter, string>> = {
  none: 'shows at once',
  fade: 'fades in',
  up: 'slides up',
  side: 'slides in from the side',
  zoom: 'zooms in slightly',
  pop: 'pops up',
  reveal: 'is revealed',
};

const ORDER_TEXT: Readonly<Record<MotionOrder, string>> = {
  together: 'every part at once',
  stagger: 'parts one after another',
  rows: 'row by row, only in a section laid out in rows',
};

const ACCENT_TEXT: Readonly<Record<MotionAccent, string>> = {
  lines: 'the heading appears line by line',
  image: 'images settle into their frame',
  count: 'figures count up',
  steps: 'the steps of a process connect one after another',
};

const TONES: Readonly<Record<AiTone, string>> = {
  friendly: 'warm and friendly',
  professional: 'clear, professional and trustworthy',
  energetic: 'upbeat and energetic',
};

function listed<T extends string>(texts: Readonly<Record<T, string>>): string {
  return Object.entries<string>(texts)
    .map(([id, text]) => `${id} (${text})`)
    .join(', ');
}

/** The numbers ("3") of the sections the AI may change: those that are not locked. */
export function changeablePositions(sections: readonly Pick<SectionInstance, 'type'>[]): string[] {
  return sections.flatMap((_section, index) =>
    isMotionLocked(sections, index) ? [] : [String(index + 1)],
  );
}

function sectionLine(
  sections: readonly Pick<SectionInstance, 'type' | 'variant'>[],
  section: Pick<SectionInstance, 'type' | 'variant'>,
  index: number,
): string {
  const name = `${index + 1}. ${getSectionDefinition(section.type).label} (${section.type}, ${section.variant})`;
  if (isMotionLocked(sections, index)) {
    return `${name}: always shows at once, cannot change`;
  }
  const capability = motionCapabilityOf(section);
  const traits = [
    capability.grid ? 'laid out in rows' : 'not laid out in rows',
    capability.accents.length === 0
      ? 'no accents'
      : `accents it can show: ${capability.accents.join(', ')}`,
  ];
  return `${name}: ${traits.join('; ')}`;
}

/** The system text and prompt that ask for the page's motion. */
export function buildMotionPrompt(
  brief: AiBrief,
  sections: readonly Pick<SectionInstance, 'type' | 'variant'>[],
): SectionPrompt {
  const system = [
    'You choose how a landing page moves as visitors scroll down: one style for the whole page, and at most 3 sections that move differently.',
    `Styles: ${listed(STYLE_TEXT)}.`,
    'Rules:',
    '- Choose the style that suits the business, its customers and the tone of the brief.',
    `- Change a section only when it clearly helps, e.g. figures that count up or a section that should stand out. Most pages need no change: leave "sections" empty. "${FOLLOW}" keeps what the style does.`,
    `- enter, how the section appears: ${listed(ENTER_TEXT)}.`,
    `- order, how the parts of the section follow each other: ${listed(ORDER_TEXT)}.`,
    `- accent, one accent to add to the section, only one it can show: ${listed(ACCENT_TEXT)}.`,
    '- Answer with one JSON object that matches the JSON Schema you are given, and nothing else.',
  ].join('\n');
  const goal = goalDefinitions[brief.goal];
  const prompt = [
    `Page goal: ${goal.title} (${goal.description})`,
    'Brief:',
    `- Product or service: ${brief.product}`,
    `- Target customers: ${brief.audience}`,
    `- Key message and differentiators: ${brief.differentiators}`,
    `- Tone: ${TONES[brief.tone]}`,
    'Sections of the page, in order:',
    ...sections.map((section, index) => sectionLine(sections, section, index)),
  ].join('\n');
  return { system, prompt };
}

/** The JSON Schema of the answer: a moving style, and overrides of the changeable sections. */
export function motionJsonSchema(positions: readonly string[]): JsonSchema {
  return {
    type: 'object',
    properties: {
      style: { type: 'string', enum: MOVING_STYLES, description: 'The style of the whole page' },
      sections: {
        type: 'array',
        // Nothing to change on a page whose sections are all locked.
        maxItems: positions.length === 0 ? 0 : MAX_MOTION_OVERRIDES,
        description: 'Sections that move differently from the style',
        items: {
          type: 'object',
          properties: {
            section: {
              type: 'string',
              ...(positions.length === 0 ? {} : { enum: positions }),
              description: 'The number of the section',
            },
            enter: { type: 'string', enum: [FOLLOW, ...motionEnterIds] },
            order: { type: 'string', enum: [FOLLOW, ...motionOrderIds] },
            accent: { type: 'string', enum: [FOLLOW, ...motionAccentIds] },
          },
          required: ['section', 'enter', 'order', 'accent'],
          additionalProperties: false,
        },
      },
    },
    required: ['style', 'sections'],
    additionalProperties: false,
  };
}

/** The page's motion the AI chose, and the sections (by id) that move their own way. */
export interface MotionChoice {
  motion: PageMotion;
  sections: ReadonlyMap<string, SectionMotion>;
}

const answerSchema = z.object({
  style: z.enum(MOVING_STYLES),
  sections: z.array(z.unknown()).default([]),
});

const overrideSchema = z.object({
  section: z.union([z.string(), z.number()]).transform(String),
  enter: z.enum([FOLLOW, ...motionEnterIds]).default(FOLLOW),
  order: z.enum([FOLLOW, ...motionOrderIds]).default(FOLLOW),
  accent: z.enum([FOLLOW, ...motionAccentIds]).default(FOLLOW),
});
type Override = z.output<typeof overrideSchema>;

/**
 * What a section answer changes, as the editor would store it, or undefined when it changes
 * nothing the section can show (ADR-032): an accent the section has no content for, or one the
 * style already shows; "Theo hàng" becomes "Lần lượt" without rows; a process whose steps connect
 * keeps entering step by step; a section that shows at once needs nothing else.
 */
function cleanOverride(
  page: PageMotion,
  section: Pick<SectionInstance, 'type' | 'variant'>,
  answer: Override,
): SectionMotion | undefined {
  const style = MOTION_STYLES[page.style];
  const capability = motionCapabilityOf(section);
  if (answer.enter === 'none') {
    return { enter: 'none' };
  }
  const own: SectionMotion = {};
  if (answer.enter !== FOLLOW && answer.enter !== style.enter) {
    own.enter = answer.enter;
  }
  if (
    answer.accent !== FOLLOW &&
    capability.accents.includes(answer.accent) &&
    !pageAccentOn(page, answer.accent)
  ) {
    own.accents = { [answer.accent]: true };
  }
  const steps =
    capability.accents.includes('steps') && (own.accents?.steps ?? pageAccentOn(page, 'steps'));
  if (answer.order !== FOLLOW && !steps) {
    const withoutRows = (order: MotionOrder): MotionOrder =>
      order === 'rows' && !capability.grid ? 'stagger' : order;
    const order = withoutRows(answer.order);
    if (order !== withoutRows(style.order)) {
      own.order = order;
    }
  }
  return storedSectionMotion(own);
}

/**
 * The AI's answer as a motion choice for `sections`, or null when it is not one: not JSON (a code
 * fence around it is tolerated), or no style that moves. Section answers that cannot apply are
 * dropped one by one; at most `MAX_MOTION_OVERRIDES` are kept, in the answer's order.
 */
export function readMotionChoice(
  text: string,
  sections: readonly Pick<SectionInstance, 'id' | 'type' | 'variant'>[],
): MotionChoice | null {
  const json = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  const answer = answerSchema.safeParse(parsed);
  if (!answer.success) {
    return null;
  }
  const motion: PageMotion = { ...DEFAULT_PAGE_MOTION, style: answer.data.style };
  const chosen = new Map<string, SectionMotion>();
  for (const entry of answer.data.sections) {
    if (chosen.size === MAX_MOTION_OVERRIDES) {
      break;
    }
    const override = overrideSchema.safeParse(entry);
    if (!override.success) {
      continue;
    }
    const index = Number(override.data.section) - 1;
    const section = Number.isInteger(index) ? sections[index] : undefined;
    if (section === undefined || isMotionLocked(sections, index) || chosen.has(section.id)) {
      continue;
    }
    const own = cleanOverride(motion, section, override.data);
    if (own !== undefined) {
      chosen.set(section.id, own);
    }
  }
  return { motion, sections: chosen };
}

/** `composition` with the motion the AI chose; sections it did not name keep theirs. */
export function withMotionChoice(composition: Composition, choice: MotionChoice): Composition {
  return {
    ...composition,
    motion: choice.motion,
    sections: composition.sections.map((section) => {
      const own = choice.sections.get(section.id);
      return own === undefined ? section : { ...section, motion: own };
    }),
  };
}
