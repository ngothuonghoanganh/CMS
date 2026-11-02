import type { SectionInstance, SectionType } from '@plp/contracts';
import {
  type AnySectionDefinition,
  getAtPath,
  getSectionDefinition,
  getVariant,
  listMaximum,
  listMinimum,
  type ListField,
  samplePathsOf,
  type SectionVariant,
  setAtPath,
} from '@plp/sections/schema';
import { z } from 'zod';
import type { JsonSchema } from '../ai-text-model.js';

/**
 * What the AI may write in a section, and how its answer becomes the section's content (ADR-031).
 * The AI writes text fields and the labels of buttons in use, nothing else: never where a link
 * leads, a phone number, an image or a variant. Pure functions, unit-tested.
 */

/**
 * Fields the AI never writes, by section type: facts only the business knows. The brand (empty
 * is the site name); real customers' words and names; captions of photos the AI never sees; the
 * business's own name, address, phone number, opening hours and links.
 */
export const AI_NEVER_WRITES: Readonly<Partial<Record<SectionType, readonly string[]>>> = {
  navbar: ['brandText'],
  testimonials: ['items'],
  before_after: ['beforeCaption', 'afterCaption'],
  footer: ['businessName', 'address', 'phone', 'hours', 'links', 'copyright'],
};

/** One string the AI writes: `key` in its answer, `path` in the content (of an item, in a list). */
export interface CopySlot {
  key: string;
  path: string;
  label: string;
  maxLength: number;
  required: boolean;
  multiline: boolean;
}

/** A list whose items the AI writes, with as many items as the variant allows. */
export interface CopyList {
  key: string;
  itemLabel: string;
  min: number;
  max: number;
  fields: readonly CopySlot[];
}

export interface CopyPlan {
  fields: readonly CopySlot[];
  lists: readonly CopyList[];
}

/** The answer's key for the paths the AI marks as stating figures, prices or claims. */
export const REVIEW_KEY = 'review';

function isHidden(variant: SectionVariant | undefined, key: string): boolean {
  return variant?.hiddenFields?.includes(key) ?? false;
}

function listItemSlots(field: ListField, variant: SectionVariant | undefined): CopySlot[] {
  return field.itemFields.flatMap((itemField): CopySlot[] =>
    itemField.kind === 'text' && !isHidden(variant, `${field.key}.${itemField.key}`)
      ? [
          {
            key: itemField.key,
            path: itemField.key,
            label: itemField.label,
            maxLength: itemField.maxLength,
            required: itemField.required ?? false,
            multiline: itemField.multiline,
          },
        ]
      : [],
  );
}

/**
 * The plan of a section in its variant: its visible text fields, the labels of its buttons in use
 * (a label added to an unused button would publish a button that leads nowhere) and the text of
 * its lists' items, minus `AI_NEVER_WRITES`. Empty when the AI has nothing to write there.
 */
export function copyPlanOf(
  section: Pick<SectionInstance, 'type' | 'variant' | 'content'>,
): CopyPlan {
  const definition = getSectionDefinition(section.type);
  const variant = getVariant(definition, section.variant);
  const never = AI_NEVER_WRITES[section.type] ?? [];
  const fields: CopySlot[] = [];
  const lists: CopyList[] = [];
  for (const field of definition.fields) {
    if (isHidden(variant, field.key) || never.includes(field.key)) {
      continue;
    }
    switch (field.kind) {
      case 'text':
        fields.push({
          key: field.key,
          path: field.key,
          label: field.label,
          maxLength: field.maxLength,
          required: field.required ?? false,
          multiline: field.multiline,
        });
        break;
      case 'cta': {
        const label = getAtPath(section.content, `${field.key}.label`);
        if (typeof label === 'string' && label.trim() !== '') {
          fields.push({
            key: field.key,
            path: `${field.key}.label`,
            label: `${field.label} (chữ trên nút)`,
            maxLength: field.labelMaxLength,
            required: true,
            multiline: false,
          });
        }
        break;
      }
      case 'list': {
        const slots = listItemSlots(field, variant);
        if (slots.length > 0) {
          lists.push({
            key: field.key,
            itemLabel: field.itemLabel,
            min: listMinimum(section.type, section.variant, field.key),
            max: listMaximum(section.type, section.variant, field.key),
            fields: slots,
          });
        }
        break;
      }
      case 'image':
      case 'select':
      case 'boolean':
        break;
    }
  }
  return { fields, lists };
}

export function isEmptyPlan(plan: CopyPlan): boolean {
  return plan.fields.length === 0 && plan.lists.length === 0;
}

function stringSchema(slot: CopySlot): JsonSchema {
  return {
    type: 'string',
    ...(slot.required ? { minLength: 1 } : {}),
    maxLength: slot.maxLength,
    description: slot.label,
  };
}

/** The JSON Schema the AI's answer must match: every field, every list, and `review`. */
export function copyJsonSchema(plan: CopyPlan): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  for (const slot of plan.fields) {
    properties[slot.key] = stringSchema(slot);
  }
  for (const list of plan.lists) {
    properties[list.key] = {
      type: 'array',
      minItems: list.min,
      maxItems: list.max,
      description: list.itemLabel,
      items: {
        type: 'object',
        properties: Object.fromEntries(list.fields.map((slot) => [slot.key, stringSchema(slot)])),
        required: list.fields.map((slot) => slot.key),
        additionalProperties: false,
      },
    };
  }
  properties[REVIEW_KEY] = {
    type: 'array',
    items: { type: 'string' },
    description: 'Đường dẫn các câu nêu số liệu, giá hay cam kết',
  };
  return {
    type: 'object',
    properties,
    required: [
      ...plan.fields.map((slot) => slot.key),
      ...plan.lists.map((list) => list.key),
      REVIEW_KEY,
    ],
    additionalProperties: false,
  };
}

/** What the answer said, after checks: strings by content path, item counts, review paths. */
export interface SectionCopy {
  /** Content path → text, e.g. "heading", "primaryCta.label", "items.1.title". */
  texts: ReadonlyMap<string, string>;
  /** List key → number of items written. */
  itemCounts: ReadonlyMap<string, number>;
  /** Paths the AI marked, kept only where it wrote. */
  flagged: readonly string[];
}

/** Why an answer cannot be used, for the one retry the AI gets (never the answer itself). */
export interface CopyIssue {
  path: string;
  message: string;
}

export type CopyParseResult = { ok: true; copy: SectionCopy } | { ok: false; issues: CopyIssue[] };

/** Tags of any kind: the content has no HTML (ADR-007), and the AI does not add any. */
const HTML_TAG = /<\/?[a-z][^>]*>/i;
/**
 * Scripts a Vietnamese or English page never uses; small models drift into them mid-sentence.
 */
const FOREIGN_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

function normalizeText(value: string, multiline: boolean): string {
  const text = value.replace(/\r\n?/g, '\n').trim();
  return multiline
    ? text
        .replace(/[^\S\n]+/g, ' ')
        .replace(/ ?\n ?/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
    : text.replace(/\s+/g, ' ');
}

function checkText(
  value: unknown,
  slot: CopySlot,
  path: string,
  issues: CopyIssue[],
): string | null {
  if (typeof value !== 'string') {
    issues.push({ path, message: 'must be a string' });
    return null;
  }
  const text = normalizeText(value, slot.multiline);
  if (slot.required && text === '') {
    issues.push({ path, message: 'must not be empty' });
  } else if (text.length > slot.maxLength) {
    issues.push({ path, message: `is longer than ${slot.maxLength} characters` });
  } else if (HTML_TAG.test(text)) {
    issues.push({ path, message: 'must be plain text, without HTML' });
  } else if (FOREIGN_SCRIPT.test(text)) {
    issues.push({ path, message: 'contains characters of another language' });
  } else {
    return text;
  }
  return null;
}

const answerSchema = z.record(z.string(), z.unknown());

/**
 * Reads the AI's text as an answer to `plan`: JSON (a code fence around it is tolerated), every
 * field a string within its limits, plain text in the page's script, lists within the variant's
 * item counts. Keys the plan does not name are ignored.
 */
export function parseSectionCopy(plan: CopyPlan, text: string): CopyParseResult {
  const json = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    // The syntax error quotes the answer; the issue says what matters without it.
    return { ok: false, issues: [{ path: '', message: 'is not valid JSON' }] };
  }
  const answer = answerSchema.safeParse(parsed);
  if (!answer.success) {
    return { ok: false, issues: [{ path: '', message: 'must be a JSON object' }] };
  }
  const issues: CopyIssue[] = [];
  const texts = new Map<string, string>();
  const itemCounts = new Map<string, number>();
  for (const slot of plan.fields) {
    const text = checkText(answer.data[slot.key], slot, slot.key, issues);
    if (text !== null) {
      texts.set(slot.path, text);
    }
  }
  for (const list of plan.lists) {
    const items = answer.data[list.key];
    if (!Array.isArray(items)) {
      issues.push({ path: list.key, message: 'must be an array' });
      continue;
    }
    if (items.length < list.min || items.length > list.max) {
      issues.push({
        path: list.key,
        message: `must have ${list.min} to ${list.max} items, not ${items.length}`,
      });
      continue;
    }
    itemCounts.set(list.key, items.length);
    items.forEach((item: unknown, index) => {
      const record = answerSchema.safeParse(item);
      if (!record.success) {
        issues.push({ path: `${list.key}.${index}`, message: 'must be an object' });
        return;
      }
      for (const slot of list.fields) {
        const path = `${list.key}.${index}.${slot.key}`;
        const text = checkText(record.data[slot.key], slot, path, issues);
        if (text !== null) {
          texts.set(`${list.key}.${index}.${slot.path}`, text);
        }
      }
    });
  }
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  const review = answer.data[REVIEW_KEY];
  const flagged = Array.isArray(review)
    ? review.flatMap((entry: unknown) => {
        if (typeof entry !== 'string') {
          return [];
        }
        // The AI names a button by its key ("primaryCta"); its text sits at "primaryCta.label".
        const slot = plan.fields.find((candidate) => candidate.key === entry);
        const path = slot?.path ?? entry;
        return texts.has(path) ? [path] : [];
      })
    : [];
  return { ok: true, copy: { texts, itemCounts, flagged: [...new Set(flagged)] } };
}

/** A sentence with a figure: a price, a discount, a duration, a statistic. */
const FIGURE = /\p{Nd}/u;

function listFieldOf(definition: AnySectionDefinition, key: string): ListField {
  const field = definition.fields.find((candidate) => candidate.key === key);
  if (field?.kind !== 'list') {
    throw new Error(`Section "${definition.type}" has no list "${key}"`);
  }
  return field;
}

/**
 * The section with the AI's copy in it: texts replaced, lists resized (items beyond the current
 * ones start from the field's new item, so icons and images keep their defaults). What the AI
 * wrote is no longer sample text; what it did not write still is. Review paths are the ones the AI
 * marked plus any it wrote that holds a figure, since small models seldom mark them all.
 */
export function applySectionCopy(
  section: SectionInstance,
  plan: CopyPlan,
  copy: SectionCopy,
): SectionInstance {
  const definition = getSectionDefinition(section.type);
  let content: Record<string, unknown> = section.content;
  for (const list of plan.lists) {
    const count = copy.itemCounts.get(list.key);
    if (count === undefined) {
      continue;
    }
    const current = getAtPath(content, list.key);
    const items = Array.isArray(current) ? current : [];
    const field = listFieldOf(definition, list.key);
    content = setAtPath(
      content,
      list.key,
      Array.from({ length: count }, (_unused, index): unknown =>
        index < items.length ? items[index] : field.newItem(section.variant),
      ),
    );
  }
  for (const [path, text] of copy.texts) {
    content = setAtPath(content, path, text);
  }
  const written = new Set(copy.texts.keys());
  const samplePaths = samplePathsOf({ ...section, content }).filter((path) => !written.has(path));
  const figures = [...copy.texts].filter(([, text]) => FIGURE.test(text)).map(([path]) => path);
  return {
    ...section,
    content,
    samplePaths,
    reviewPaths: [...new Set([...copy.flagged, ...figures])],
  };
}

/** Characters the plan can hold at most, to size the answer's token budget. */
export function planCharacters(plan: CopyPlan): number {
  const fields = plan.fields.reduce((sum, slot) => sum + slot.maxLength, 0);
  const lists = plan.lists.reduce(
    (sum, list) => sum + list.max * list.fields.reduce((total, slot) => total + slot.maxLength, 0),
    0,
  );
  return fields + lists;
}

/** The text the section holds now in the plan's fields: the draft text the prompt may show. */
export function currentCopyOf(
  section: Pick<SectionInstance, 'content'>,
  plan: CopyPlan,
): Record<string, unknown> {
  const current: Record<string, unknown> = {};
  for (const slot of plan.fields) {
    current[slot.key] = getAtPath(section.content, slot.path);
  }
  for (const list of plan.lists) {
    const items = getAtPath(section.content, list.key);
    current[list.key] = (Array.isArray(items) ? items : []).map((item: unknown) =>
      Object.fromEntries(list.fields.map((slot) => [slot.key, getAtPath(item, slot.path)])),
    );
  }
  return current;
}
