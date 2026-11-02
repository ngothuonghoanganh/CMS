import {
  type AiAssistAction,
  type AiFailure,
  type AiLanguage,
  type AiScopeSection,
  AI_SEO_TARGET,
  type AiSuggestionChange,
  type aiSuggestionRequestSchema,
  type AiTone,
  type ProblemIssue,
  type SectionInstance,
  SEO_DESCRIPTION_RECOMMENDED_MAX,
  SEO_TITLE_RECOMMENDED_MAX,
  seoSchema,
} from '@plp/contracts';
import {
  aiActionPaths,
  aiWritablePaths,
  type CopyList,
  type CopyPlan,
  type CopySlot,
  copyPlanOf,
  createSectionInstance,
  getAtPath,
  getSectionDefinition,
  getVariant,
  listLengthOf,
  parseComposition,
  setAtPath,
} from '@plp/sections/schema';
import type { z } from 'zod';
import { hasFigure, type SectionCopy } from './section-copy.js';

/**
 * The editor assistant's side of the API (ADR-031, board 21), pure and unit-tested: reads the
 * scope's text the editor sent with the registry, decides what the AI writes (one request per
 * section, or the page's SEO), words the prompts, and turns the AI's answers into changes.
 */

export type AiSuggestionValues = z.output<typeof aiSuggestionRequestSchema>;

/**
 * One AI request of a suggestion. `plan` is what the AI is asked for (JSON Schema and prompt),
 * `parsePlan` the limits its answer is read with: the same for a section; for the SEO, the AI is
 * asked for the recommended lengths and held to the schema's.
 */
interface UnitBase {
  plan: CopyPlan;
  parsePlan: CopyPlan;
  /** The content paths the AI writes, in the order changes are listed. */
  paths: readonly string[];
  /** Text by path as the editor holds it now: the `before` of each change. */
  current: ReadonlyMap<string, string>;
}

export interface SectionUnit extends UnitBase {
  kind: 'section';
  /** The section rebuilt from the editor's text, as the registry parsed it. */
  section: SectionInstance;
}

export interface SeoUnit extends UnitBase {
  kind: 'seo';
  /** The page's text, which the SEO title and description sum up. */
  pageText: string;
}

export type SuggestionUnit = SectionUnit | SeoUnit;

export interface SuggestionPlan {
  units: SuggestionUnit[];
  language: AiLanguage;
}

export type SuggestionPlanResult =
  { ok: true; plan: SuggestionPlan } | { ok: false; issues: ProblemIssue[] };

/** The key of the one field a "Đoạn chữ" request asks for. */
const FIELD_KEY = 'text';

/** The most page text a "Gợi ý SEO" prompt carries: enough to sum a landing page up. */
export const SEO_PAGE_TEXT_MAX = 4000;

function issue(path: ProblemIssue['path'], code: string, message: string): ProblemIssue {
  return { path, code, message };
}

/** Item counts of the lists the editor sent text for, from paths like "items.2.answer". */
function listCountsOf(texts: Readonly<Record<string, string>>): Map<string, Set<number>> {
  const counts = new Map<string, Set<number>>();
  for (const path of Object.keys(texts)) {
    const match = /^([A-Za-z][A-Za-z0-9]*)\.(\d+)\./.exec(path);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      const indexes = counts.get(match[1]) ?? new Set<number>();
      indexes.add(Number(match[2]));
      counts.set(match[1], indexes);
    }
  }
  return counts;
}

/** Every path the section's text could be at: its writable paths with each visible button in use. */
function candidatePaths(section: Pick<SectionInstance, 'type' | 'variant' | 'content'>): string[] {
  let content = section.content;
  for (const field of getSectionDefinition(section.type).fields) {
    if (field.kind === 'cta') {
      content = setAtPath(content, `${field.key}.label`, '·');
    }
  }
  return aiWritablePaths({ ...section, content });
}

type Rebuilt = { ok: true; section: SectionInstance } | { ok: false; issues: ProblemIssue[] };

/**
 * The section of the editor rebuilt from its text: the registry's sample content in the editor's
 * variant, its lists at the editor's lengths and every text the AI could write replaced by the
 * editor's (empty when not sent, so an unused button stays unused). Paths the AI may not write are
 * refused, and the registry parses the result like any draft.
 */
export function sectionFromText(input: AiScopeSection, at: number): Rebuilt {
  const where = ['sections', at] as const;
  const definition = getSectionDefinition(input.type);
  if (!getVariant(definition, input.variant)) {
    return {
      ok: false,
      issues: [
        issue(
          [...where, 'variant'],
          'invalid_variant',
          `Kiểu bố cục "${input.variant}" không có trong section ${definition.label}`,
        ),
      ],
    };
  }
  const base = createSectionInstance(input.type, input.variant, input.id);
  const counts = listCountsOf(input.texts);
  let content = base.content;
  for (const list of copyPlanOf(base).lists) {
    const indexes = counts.get(list.key) ?? new Set<number>();
    const field = definition.fields.find((candidate) => candidate.key === list.key);
    if (field?.kind !== 'list') {
      continue;
    }
    // "items.0" and "items.2" without "items.1" is no list the editor can hold.
    if ([...indexes].some((index) => index >= indexes.size)) {
      return {
        ok: false,
        issues: [
          issue([...where, 'texts'], 'invalid_list', `Danh sách "${list.key}" bị thiếu mục`),
        ],
      };
    }
    const sample = getAtPath(base.content, list.key);
    const sampleItems: unknown[] = Array.isArray(sample) ? sample : [];
    content = setAtPath(
      content,
      list.key,
      Array.from({ length: indexes.size }, (_unused, index): unknown =>
        index < sampleItems.length ? sampleItems[index] : field.newItem(input.variant),
      ),
    );
  }
  for (const path of candidatePaths({ ...base, content })) {
    content = setAtPath(content, path, input.texts[path] ?? '');
  }
  const rebuilt: SectionInstance = { ...base, content };
  const writable = new Set(aiWritablePaths(rebuilt));
  const refused = Object.keys(input.texts).filter((path) => !writable.has(path));
  if (refused.length > 0) {
    return {
      ok: false,
      issues: refused.map((path) =>
        issue([...where, 'texts', path], 'not_writable', 'AI không viết nội dung này'),
      ),
    };
  }
  const parsed = parseComposition({ version: 1, sections: [rebuilt] });
  if (!parsed.success) {
    return {
      ok: false,
      // ["sections", 0, "content", "items", 1, "title"] → ["sections", at, "texts", "items.1.title"]
      issues: parsed.issues.map((item) => ({
        ...item,
        path: [...where, 'texts', item.path.slice(3).join('.')],
      })),
    };
  }
  const [section] = parsed.composition.sections;
  if (section === undefined) {
    throw new Error('The registry parsed a section into nothing');
  }
  return { ok: true, section };
}

function slotsByPath(plan: CopyPlan, section: SectionInstance): Map<string, CopySlot> {
  const slots = new Map<string, CopySlot>();
  for (const slot of plan.fields) {
    slots.set(slot.path, slot);
  }
  for (const list of plan.lists) {
    const length = listLengthOf(section.content, list.key);
    for (let index = 0; index < length; index += 1) {
      for (const slot of list.fields) {
        slots.set(`${list.key}.${index}.${slot.path}`, slot);
      }
    }
  }
  return slots;
}

/**
 * What the AI is asked for in a section: one field ("Đoạn chữ"), or the targeted fields with each
 * list at its current length, since a suggestion changes text, never how many items there are.
 */
function sectionUnit(
  section: SectionInstance,
  paths: readonly string[],
  field: boolean,
): SectionUnit {
  const full = copyPlanOf(section);
  const targets = new Set(paths);
  const current = new Map(paths.map((path) => [path, textAt(section, path)]));
  let plan: CopyPlan;
  if (field) {
    const [path] = paths;
    const slot = path === undefined ? undefined : slotsByPath(full, section).get(path);
    if (path === undefined || slot === undefined) {
      throw new Error(`No slot of section ${section.type} at "${String(path)}"`);
    }
    plan = { fields: [{ ...slot, key: FIELD_KEY, path }], lists: [] };
  } else {
    plan = {
      fields: full.fields.filter((slot) => targets.has(slot.path)),
      lists: full.lists.flatMap((list): CopyList[] => {
        const length = listLengthOf(section.content, list.key);
        const all = Array.from({ length }, (_unused, index) =>
          list.fields.map((slot) => `${list.key}.${index}.${slot.path}`),
        ).flat();
        return length > 0 && all.every((path) => targets.has(path))
          ? [{ ...list, min: length, max: length }]
          : [];
      }),
    };
  }
  return { kind: 'section', section, plan, parsePlan: plan, paths, current };
}

function textAt(section: SectionInstance, path: string): string {
  const value = getAtPath(section.content, path);
  return typeof value === 'string' ? value : '';
}

function seoSlot(key: 'title' | 'description', maxLength: number): CopySlot {
  return {
    key,
    path: key,
    label: key === 'title' ? 'Tiêu đề SEO' : 'Mô tả SEO',
    maxLength,
    required: true,
    multiline: false,
    button: false,
  };
}

const SEO_HARD_MAX = {
  title: seoSchema.shape.title.maxLength ?? 200,
  description: seoSchema.shape.description.maxLength ?? 400,
};

/** The page's text in order, field labels first, cut to `SEO_PAGE_TEXT_MAX`. */
function pageTextOf(sections: readonly SectionInstance[]): string {
  const lines = sections.flatMap((section) => {
    const label = getSectionDefinition(section.type).label;
    return aiWritablePaths(section)
      .map((path) => textAt(section, path).trim())
      .filter((text) => text !== '')
      .map((text) => `${label}: ${text}`);
  });
  return lines.join('\n').slice(0, SEO_PAGE_TEXT_MAX);
}

function seoUnit(
  sections: readonly SectionInstance[],
  seo: NonNullable<AiSuggestionValues['seo']>,
): SeoUnit {
  return {
    kind: 'seo',
    plan: {
      fields: [
        seoSlot('title', SEO_TITLE_RECOMMENDED_MAX),
        seoSlot('description', SEO_DESCRIPTION_RECOMMENDED_MAX),
      ],
      lists: [],
    },
    parsePlan: {
      fields: [
        seoSlot('title', SEO_HARD_MAX.title),
        seoSlot('description', SEO_HARD_MAX.description),
      ],
      lists: [],
    },
    paths: ['title', 'description'],
    current: new Map([
      ['title', seo.title],
      ['description', seo.description],
    ]),
    pageText: pageTextOf(sections),
  };
}

/** Vietnamese letters a page in English never has. */
const VIETNAMESE = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/iu;
const LATIN = /[a-z]/i;

/**
 * The language the scope is written in: Vietnamese when any Vietnamese letter shows, English for
 * other Latin text, Vietnamese for no text at all. A small model otherwise answers in English.
 */
export function languageOf(texts: Iterable<string>): AiLanguage {
  let latin = false;
  for (const text of texts) {
    if (VIETNAMESE.test(text)) {
      return 'vi';
    }
    latin ||= LATIN.test(text);
  }
  return latin ? 'en' : 'vi';
}

const NOTHING_HERE: Partial<Record<AiAssistAction, string>> = {
  suggest_heading: 'Phạm vi này không có tiêu đề để gợi ý',
  suggest_cta: 'Phạm vi này không có nút đang dùng',
};

/**
 * The AI requests of a suggestion, or why it cannot be made (paths into the request): sections
 * the registry refuses, a path the AI may not write, sections that are not the scope's, or nothing
 * the action writes in the scope.
 */
export function planSuggestion(input: AiSuggestionValues): SuggestionPlanResult {
  const ids = new Set<string>();
  const sections: SectionInstance[] = [];
  const issues: ProblemIssue[] = [];
  input.sections.forEach((item, index) => {
    if (ids.has(item.id)) {
      issues.push(issue(['sections', index, 'id'], 'duplicate', 'Mã section bị trùng'));
      return;
    }
    ids.add(item.id);
    const rebuilt = sectionFromText(item, index);
    if (rebuilt.ok) {
      sections.push(rebuilt.section);
    } else {
      issues.push(...rebuilt.issues);
    }
  });
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  const { scope, action } = input;
  if (scope.kind !== 'page' && (sections.length !== 1 || sections[0]?.id !== scope.sectionId)) {
    return {
      ok: false,
      issues: [issue(['sections'], 'scope_mismatch', 'Gửi kèm đúng chữ của section đang chọn')],
    };
  }
  if (action === 'write_section' && scope.kind !== 'section') {
    return {
      ok: false,
      issues: [issue(['scope'], 'scope_mismatch', 'Chọn một section để viết nội dung section')],
    };
  }
  let units: SuggestionUnit[];
  if (action === 'suggest_seo') {
    if (input.seo === undefined || sections.length === 0) {
      return {
        ok: false,
        issues: [issue(['sections'], 'nothing_to_write', 'Trang chưa có chữ để gợi ý SEO')],
      };
    }
    units = [seoUnit(sections, input.seo)];
  } else if (scope.kind === 'field') {
    const [section] = sections;
    if (section === undefined || !aiWritablePaths(section).includes(scope.path)) {
      return {
        ok: false,
        issues: [issue(['scope', 'path'], 'not_writable', 'AI không viết nội dung này')],
      };
    }
    units = aiActionPaths(section, action).includes(scope.path)
      ? [sectionUnit(section, [scope.path], true)]
      : [];
  } else {
    units = sections.flatMap((section) => {
      const paths = aiActionPaths(section, action);
      return paths.length === 0 ? [] : [sectionUnit(section, paths, false)];
    });
  }
  if (units.length === 0) {
    return {
      ok: false,
      issues: [
        issue(
          ['action'],
          'nothing_to_write',
          NOTHING_HERE[action] ?? 'Phạm vi này không có chữ để AI viết',
        ),
      ],
    };
  }
  const language = languageOf(
    units.flatMap((unit) =>
      unit.kind === 'seo' ? [unit.pageText, ...unit.current.values()] : [...unit.current.values()],
    ),
  );
  return { ok: true, plan: { units, language } };
}

/* Prompts. Instructions in English, which small models follow best; the copy in the page's language. */

const LANGUAGES: Record<AiLanguage, string> = {
  vi: 'Vietnamese, with full diacritics',
  en: 'English',
};

const TONES: Record<AiTone, string> = {
  friendly: 'warm and friendly, speaking directly to the reader',
  professional: 'clear, professional and trustworthy',
  energetic: 'upbeat and energetic, with short sentences',
};

export interface SuggestionContext {
  siteName: string;
  pageTitle: string;
}

export interface SuggestionTask {
  action: AiAssistAction;
  tone: AiTone | undefined;
  /** The user's own words, at most `AI_INSTRUCTION_MAX` characters; empty for none. */
  instruction: string;
}

function taskText(task: SuggestionTask): string {
  switch (task.action) {
    case 'rewrite':
      // Small models otherwise hand most fields back as they were.
      return 'Rewrite every field in new words, clearer and more persuasive, keeping its meaning, its facts and about its length. Do not return a field unchanged.';
    case 'shorten':
      return 'Make every field shorter and tighter, about half its length, keeping its meaning and its facts.';
    case 'change_tone':
      return `Rewrite every field in this tone: ${TONES[task.tone ?? 'friendly']}. Keep its meaning and its facts.`;
    case 'suggest_heading':
      return 'Suggest a better heading: short, clear and specific to what the page offers.';
    case 'suggest_cta':
      return 'Suggest better button labels: each a short action the visitor takes, 2 to 5 words.';
    case 'write_section':
      return 'Write this section anew, replacing any sample or placeholder text with copy that fits the page.';
    case 'suggest_seo':
      return 'Write the page’s search title and meta description from its text: specific, inviting, within the lengths.';
    case 'custom':
      return 'Edit the fields as the user asks below. Leave a field as it is when the request does not concern it.';
  }
}

function systemText(language: AiLanguage): string {
  return [
    'You are the writing assistant of a landing page builder for small businesses.',
    'Rules:',
    `- Write in ${LANGUAGES[language]}.`,
    '- Plain text only: no HTML, no Markdown, no emoji.',
    '- Keep every field within its maximum length.',
    '- Keep to the facts of the current text and the user’s request. Never invent prices, discounts, figures, durations, guarantees, awards, policies, or claims about health, safety or results.',
    '- Never write phone numbers, addresses, email addresses, links or the names of real people.',
    '- In "review", list the field of every sentence you wrote that states a figure, a price, a promise or a health claim.',
    '- Answer with one JSON object that matches the JSON Schema you are given, and nothing else.',
  ].join('\n');
}

function slotLine(slot: CopySlot, indent: string): string {
  return `${indent}- ${slot.key}: ${slot.label}, ${slot.required ? 'required' : 'optional'}, at most ${slot.maxLength} characters`;
}

function fieldLines(plan: CopyPlan): string[] {
  return [
    ...plan.fields.map((slot) => slotLine(slot, '')),
    ...plan.lists.flatMap((list) => [
      `- ${list.key}: exactly ${list.min} items "${list.itemLabel}", in the same order, each with:`,
      ...list.fields.map((slot) => slotLine(slot, '  ')),
    ]),
  ];
}

/** The unit's current text keyed as the answer is: what the AI rewrites. */
function currentAnswerOf(unit: SuggestionUnit): Record<string, unknown> {
  const answer: Record<string, unknown> = {};
  for (const slot of unit.plan.fields) {
    answer[slot.key] = unit.current.get(slot.path) ?? '';
  }
  for (const list of unit.plan.lists) {
    answer[list.key] = Array.from({ length: list.min }, (_unused, index) =>
      Object.fromEntries(
        list.fields.map((slot) => [
          slot.key,
          unit.current.get(`${list.key}.${index}.${slot.path}`) ?? '',
        ]),
      ),
    );
  }
  return answer;
}

/**
 * The system text and prompt of one unit: the site's and page's names, what the section is, the
 * task, the user's request, the fields with their limits and their current text. Nothing else of
 * the site or page goes in: no lead, consent text, link, image or phone number (ADR-031).
 */
export function buildSuggestionPrompt(
  context: SuggestionContext,
  unit: SuggestionUnit,
  task: SuggestionTask,
  language: AiLanguage,
): { system: string; prompt: string } {
  const about =
    unit.kind === 'seo'
      ? ['Page text:', unit.pageText === '' ? '(none)' : unit.pageText]
      : (() => {
          const definition = getSectionDefinition(unit.section.type);
          return [
            `Section: ${definition.label}: ${definition.description}`,
            `Section type: ${unit.section.type}`,
          ];
        })();
  const prompt = [
    `Site: ${context.siteName}`,
    `Page: ${context.pageTitle}`,
    ...about,
    `Task: ${taskText(task)}`,
    ...(task.instruction === '' ? [] : [`Request from the user: ${task.instruction}`]),
    'Fields:',
    ...fieldLines(unit.plan),
    'Current text:',
    JSON.stringify(currentAnswerOf(unit)),
    // Said last too: a small model otherwise drifts into the language of the instructions.
    `Write every field in ${LANGUAGES[language]}.`,
  ].join('\n');
  return { system: systemText(language), prompt };
}

/* Results. */

/** The unit's paths whose text the registry refuses once the AI's text is in. */
function registryRefusals(unit: SuggestionUnit, texts: ReadonlyMap<string, string>): Set<string> {
  if (unit.kind === 'seo') {
    const refused = new Set<string>();
    for (const [path, text] of texts) {
      const field = path === 'title' ? seoSchema.shape.title : seoSchema.shape.description;
      if (!field.safeParse(text).success) {
        refused.add(path);
      }
    }
    return refused;
  }
  let content = unit.section.content;
  for (const [path, text] of texts) {
    content = setAtPath(content, path, text);
  }
  const parsed = parseComposition({ version: 1, sections: [{ ...unit.section, content }] });
  return new Set(parsed.success ? [] : parsed.issues.map((item) => item.path.slice(3).join('.')));
}

/**
 * The AI's answer to a unit, with what the registry refuses taken out of it: `issues` names those
 * paths for the retry.
 */
export function checkedCopy(
  unit: SuggestionUnit,
  copy: SectionCopy,
): { copy: SectionCopy; refused: string[] } {
  const refused = registryRefusals(unit, copy.texts);
  if (refused.size === 0) {
    return { copy, refused: [] };
  }
  const texts = new Map([...copy.texts].filter(([path]) => !refused.has(path)));
  return {
    copy: { ...copy, texts, flagged: copy.flagged.filter((path) => texts.has(path)) },
    refused: [...refused],
  };
}

/** The same words, whatever the spacing: the AI's answer comes back with its whitespace tidied. */
function sameText(after: string, before: string): boolean {
  return after.replace(/\s+/g, ' ') === before.trim().replace(/\s+/g, ' ');
}

/**
 * The changes of a unit, in its order: the AI's new text where it wrote one that differs, marked
 * for review when the AI flagged it or it holds a figure; `failure` where it wrote nothing usable.
 * Text the AI left as it was is no change.
 */
export function changesOf(
  unit: SuggestionUnit,
  copy: SectionCopy,
  failure: AiFailure,
): AiSuggestionChange[] {
  const target = unit.kind === 'seo' ? AI_SEO_TARGET : unit.section.id;
  const flagged = new Set(copy.flagged);
  return unit.paths.flatMap((path): AiSuggestionChange[] => {
    const before = unit.current.get(path) ?? '';
    const after = copy.texts.get(path);
    if (after === undefined) {
      return [{ status: 'failed', sectionId: target, path, before, failure }];
    }
    if (sameText(after, before)) {
      return [];
    }
    return [
      {
        status: 'ok',
        sectionId: target,
        path,
        before,
        after,
        review: flagged.has(path) || hasFigure(after),
      },
    ];
  });
}
