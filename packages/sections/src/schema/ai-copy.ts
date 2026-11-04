import type { AiAssistAction, SectionInstance, SectionType } from '@plp/contracts';
import type { ListField, SectionVariant } from './define.js';
import { getAtPath } from './paths.js';
import { getSectionDefinition, getVariant, listMaximum, listMinimum } from './registry.js';

/**
 * What the AI may write in a section (ADR-031): text fields and the labels of buttons in use,
 * nothing else, never where a link leads, a phone number, an image or a variant. The API asks the
 * AI for these fields only and refuses any other path; the editor sends only these to the
 * assistant. Pure functions.
 */

/**
 * Fields the AI never writes, by section type: facts only the business knows. The brand (empty
 * is the site name); real customers' words and names; captions of photos the AI never sees; the
 * business's own figures (`items.value`: one field of every list item); the business's own name,
 * address, phone number, opening hours and links.
 */
export const AI_NEVER_WRITES: Readonly<Partial<Record<SectionType, readonly string[]>>> = {
  navbar: ['brandText'],
  testimonials: ['items'],
  before_after: ['beforeCaption', 'afterCaption'],
  stats: ['items.value'],
  footer: ['businessName', 'address', 'phone', 'hours', 'links', 'copyright'],
};

/** Text fields that are the label of a button, beside the buttons' own labels: a form's submit. */
export const AI_BUTTON_TEXTS: Readonly<Partial<Record<SectionType, readonly string[]>>> = {
  lead_form: ['submitLabel'],
};

/** One string the AI writes: `key` in its answer, `path` in the content (of an item, in a list). */
export interface CopySlot {
  key: string;
  path: string;
  label: string;
  maxLength: number;
  required: boolean;
  multiline: boolean;
  /** The label of a button ("Gợi ý CTA" writes these). */
  button: boolean;
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

function isHidden(variant: SectionVariant | undefined, key: string): boolean {
  return variant?.hiddenFields?.includes(key) ?? false;
}

function listItemSlots(
  field: ListField,
  variant: SectionVariant | undefined,
  never: readonly string[],
): CopySlot[] {
  return field.itemFields.flatMap((itemField): CopySlot[] =>
    itemField.kind === 'text' &&
    !isHidden(variant, `${field.key}.${itemField.key}`) &&
    !never.includes(`${field.key}.${itemField.key}`)
      ? [
          {
            key: itemField.key,
            path: itemField.key,
            label: itemField.label,
            maxLength: itemField.maxLength,
            required: itemField.required ?? false,
            multiline: itemField.multiline,
            button: false,
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
  const buttonTexts = AI_BUTTON_TEXTS[section.type] ?? [];
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
          button: buttonTexts.includes(field.key),
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
            button: true,
          });
        }
        break;
      }
      case 'list': {
        const slots = listItemSlots(field, variant, never);
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

/** Items a list of the content holds now (none when it is not a list). */
export function listLengthOf(content: unknown, listKey: string): number {
  const items = getAtPath(content, listKey);
  return Array.isArray(items) ? items.length : 0;
}

/**
 * Every content path the AI may write in the section as it is now: its plan's fields, then each
 * existing list item's text, in the order of the panel.
 */
export function aiWritablePaths(
  section: Pick<SectionInstance, 'type' | 'variant' | 'content'>,
): string[] {
  const plan = copyPlanOf(section);
  return [
    ...plan.fields.map((slot) => slot.path),
    ...plan.lists.flatMap((list) =>
      Array.from({ length: listLengthOf(section.content, list.key) }, (_unused, index) =>
        list.fields.map((slot) => `${list.key}.${index}.${slot.path}`),
      ).flat(),
    ),
  ];
}

/**
 * The paths of the section an assistant action writes: every writable one, the section's heading
 * ("Gợi ý tiêu đề"), its button labels ("Gợi ý CTA"), or none for "Gợi ý SEO", which writes the
 * page's SEO texts instead.
 */
export function aiActionPaths(
  section: Pick<SectionInstance, 'type' | 'variant' | 'content'>,
  action: AiAssistAction,
): string[] {
  switch (action) {
    case 'suggest_heading':
      return copyPlanOf(section)
        .fields.filter((slot) => slot.key === 'heading')
        .map((slot) => slot.path);
    case 'suggest_cta':
      return copyPlanOf(section)
        .fields.filter((slot) => slot.button)
        .map((slot) => slot.path);
    case 'suggest_seo':
      return [];
    case 'rewrite':
    case 'shorten':
    case 'change_tone':
    case 'write_section':
    case 'custom':
      return aiWritablePaths(section);
  }
}
