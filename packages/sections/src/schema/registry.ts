import {
  type Composition,
  type ProblemIssue,
  type SectionInstance,
  type SectionType,
  sectionTypes,
} from '@plp/contracts';
import type {
  AnySectionDefinition,
  LeafField,
  ListField,
  ListLabels,
  SectionDefinition,
  SectionVariant,
} from './define.js';
import { storedPageMotion, storedSectionMotion } from './motion-storage.js';
import { getAtPath } from './paths.js';
import { beforeAfterSection } from './sections/before-after.js';
import { benefitsSection } from './sections/benefits.js';
import { ctaBandSection } from './sections/cta-band.js';
import { faqSection } from './sections/faq.js';
import { footerSection } from './sections/footer.js';
import { heroSection } from './sections/hero.js';
import { leadFormSection } from './sections/lead-form.js';
import { logosSection } from './sections/logos.js';
import { navbarSection } from './sections/navbar.js';
import { quickContactSection } from './sections/quick-contact.js';
import { testimonialsSection } from './sections/testimonials.js';

function widen<C extends Record<string, unknown>>(
  definition: SectionDefinition<C>,
): AnySectionDefinition {
  return definition;
}

/** Every section type maps to exactly one definition; the type checker enforces completeness. */
const sectionDefinitions: { readonly [T in SectionType]: AnySectionDefinition } = {
  navbar: widen(navbarSection),
  hero: widen(heroSection),
  benefits: widen(benefitsSection),
  testimonials: widen(testimonialsSection),
  logos: widen(logosSection),
  before_after: widen(beforeAfterSection),
  faq: widen(faqSection),
  lead_form: widen(leadFormSection),
  quick_contact: widen(quickContactSection),
  cta_band: widen(ctaBandSection),
  footer: widen(footerSection),
};

/** Display order in the "Thêm section" dialog. */
export const sectionOrder: readonly SectionType[] = sectionTypes;

export function getSectionDefinition(type: SectionType): AnySectionDefinition {
  return sectionDefinitions[type];
}

/** True when the page has a section that collects personal data, i.e. a lead form (ADR-017). */
export function pageCapturesLeads(composition: Composition): boolean {
  return composition.sections.some(
    (section) => getSectionDefinition(section.type).capturesLeads === true,
  );
}

/** The page's lead form; a page holds at most one (it is a singleton). */
export function leadFormSectionOf(composition: Composition): SectionInstance | null {
  return composition.sections.find((section) => section.type === 'lead_form') ?? null;
}

export function getVariant(
  definition: AnySectionDefinition,
  variantId: string,
): SectionVariant | undefined {
  return definition.variants.find((variant) => variant.id === variantId);
}

function isHidden(variant: SectionVariant | undefined, key: string): boolean {
  return variant?.hiddenFields?.includes(key) ?? false;
}

export interface LeafOccurrence {
  /** Full content path, e.g. "items.1.title". */
  path: string;
  field: LeafField;
  value: unknown;
}

export interface CollectLeavesOptions {
  /**
   * Also return the fields the current variant hides. Switching variants keeps their values, so
   * they still hold sample text and still reference assets.
   */
  includeHidden?: boolean;
}

/** Every visible leaf field of a section's content, list items expanded. */
export function collectLeaves(
  section: Pick<SectionInstance, 'type' | 'variant' | 'content'>,
  options: CollectLeavesOptions = {},
): LeafOccurrence[] {
  const definition = getSectionDefinition(section.type);
  const variant = options.includeHidden ? undefined : getVariant(definition, section.variant);
  const leaves: LeafOccurrence[] = [];
  for (const field of definition.fields) {
    if (isHidden(variant, field.key)) {
      continue;
    }
    if (field.kind !== 'list') {
      leaves.push({ path: field.key, field, value: getAtPath(section.content, field.key) });
      continue;
    }
    const items = getAtPath(section.content, field.key);
    if (!Array.isArray(items)) {
      continue;
    }
    items.forEach((_item, index) => {
      for (const itemField of field.itemFields) {
        if (isHidden(variant, `${field.key}.${itemField.key}`)) {
          continue;
        }
        const path = `${field.key}.${index}.${itemField.key}`;
        leaves.push({ path, field: itemField, value: getAtPath(section.content, path) });
      }
    });
  }
  return leaves;
}

/**
 * Paths whose value is sample text: every non-empty text field and button label, including the
 * fields the variant hides. A later variant switch shows them again still holding the sample, so
 * they stay marked; checks and the panel only look at the fields the current variant shows.
 */
export function samplePathsOf(
  section: Pick<SectionInstance, 'type' | 'variant' | 'content'>,
): string[] {
  const paths: string[] = [];
  for (const leaf of collectLeaves(section, { includeHidden: true })) {
    if (leaf.field.kind === 'text' && typeof leaf.value === 'string' && leaf.value.trim() !== '') {
      paths.push(leaf.path);
    }
    if (leaf.field.kind === 'cta') {
      const label = getAtPath(leaf.value, 'label');
      if (typeof label === 'string' && label.trim() !== '') {
        paths.push(`${leaf.path}.label`);
      }
    }
  }
  return paths;
}

/**
 * The fewest items a list field may hold in a variant: the field's own `min`, or the variant's
 * higher minimum (the benefits grid and the testimonial cards need 3).
 */
export function listMinimum(type: SectionType, variantId: string, listKey: string): number {
  const definition = getSectionDefinition(type);
  const field = definition.fields.find((candidate) => candidate.key === listKey);
  const fieldMin = field?.kind === 'list' ? field.min : 0;
  const variantMin = getVariant(definition, variantId)?.listMin?.[listKey] ?? 0;
  return Math.max(fieldMin, variantMin);
}

/**
 * The most items a list field may hold in a variant: the field's own `max`, or the variant's lower
 * maximum (the steps of a process are 3 to 5). Infinity for a key that is not a list.
 */
export function listMaximum(type: SectionType, variantId: string, listKey: string): number {
  const definition = getSectionDefinition(type);
  const field = definition.fields.find((candidate) => candidate.key === listKey);
  const fieldMax = field?.kind === 'list' ? field.max : Infinity;
  const variantMax = getVariant(definition, variantId)?.listMax?.[listKey] ?? Infinity;
  return Math.min(fieldMax, variantMax);
}

/**
 * What a list field and its items are called in a variant: the field's own names, or the variant's
 * (a process lists "Các bước", each a "Bước"). The panel, validation and publish checks all say it.
 */
export function listLabelsOf(type: SectionType, variantId: string, field: ListField): ListLabels {
  const variantLabels = getVariant(getSectionDefinition(type), variantId)?.listLabels?.[field.key];
  return variantLabels ?? { label: field.label, itemLabel: field.itemLabel };
}

/**
 * Where a new section of this type goes when inserted at `requestedIndex`: fixed-position sections
 * go to their place, others stay between them.
 */
export function insertionIndex(
  sections: readonly Pick<SectionInstance, 'type'>[],
  type: SectionType,
  requestedIndex: number,
): number {
  const position = getSectionDefinition(type).position;
  if (position === 'first') {
    return 0;
  }
  if (position === 'last') {
    return sections.length;
  }
  return bodyInsertionIndex(sections, requestedIndex);
}

/**
 * Where a section without a fixed place lands: `requestedIndex`, kept after a navigation bar and
 * before a footer.
 */
export function bodyInsertionIndex(
  sections: readonly Pick<SectionInstance, 'type'>[],
  requestedIndex: number,
): number {
  const first = sections[0];
  const last = sections[sections.length - 1];
  const min = first && getSectionDefinition(first.type).position === 'first' ? 1 : 0;
  const max =
    last && getSectionDefinition(last.type).position === 'last'
      ? sections.length - 1
      : sections.length;
  return Math.min(Math.max(requestedIndex, min), max);
}

/** Whether a section may be moved to another index (fixed-position sections never move). */
export function canMoveSection(
  sections: readonly Pick<SectionInstance, 'type'>[],
  fromIndex: number,
  toIndex: number,
): boolean {
  const moving = sections[fromIndex];
  if (!moving || toIndex < 0 || toIndex >= sections.length || fromIndex === toIndex) {
    return false;
  }
  if (getSectionDefinition(moving.type).position) {
    return false;
  }
  const remaining = sections.filter((_section, index) => index !== fromIndex);
  return insertionIndex(remaining, moving.type, toIndex) === toIndex;
}

/** A new section with sample content, ready to insert into a composition. */
export function createSectionInstance(
  type: SectionType,
  variantId: string | undefined,
  id: string,
): SectionInstance {
  const definition = getSectionDefinition(type);
  const variant = variantId ?? definition.defaultVariant;
  if (!getVariant(definition, variant)) {
    throw new Error(`Section "${type}" has no variant "${variant}"`);
  }
  const content = definition.sampleContent(variant);
  const draft = { type, variant, content };
  return {
    id,
    type,
    variant,
    colorScheme: definition.defaultColorScheme,
    spacing: 'normal',
    visibility: { desktop: true, mobile: true },
    mobileOrder: 'auto',
    content,
    samplePaths: samplePathsOf(draft),
    reviewPaths: [],
  };
}

/**
 * Paths a section may mark as sample text or as text to review: its text fields and button labels,
 * including the fields the variant hides and every list item that exists (the candidates of
 * `samplePathsOf`).
 */
function samplePathCandidates(
  section: Pick<SectionInstance, 'type' | 'variant' | 'content'>,
): Set<string> {
  const paths = new Set<string>();
  for (const leaf of collectLeaves(section, { includeHidden: true })) {
    if (leaf.field.kind === 'text') {
      paths.add(leaf.path);
    } else if (leaf.field.kind === 'cta') {
      paths.add(`${leaf.path}.label`);
    }
  }
  return paths;
}

export type CompositionParseResult =
  | { success: true; composition: Composition; issues: [] }
  | { success: false; issues: ProblemIssue[] };

/**
 * The one rule set of `parseComposition` and `validateComposition`: checks every section against
 * its own definition and returns the issues, with paths relative to the composition, e.g.
 * ["sections", 2, "content", "heading"]. Each section without issues of its content goes to
 * `onParsed` with that content as its section schema parsed it; `validateComposition` passes none,
 * so the editor's check on every command builds nothing more than the issues.
 */
function checkSections(
  composition: Composition,
  onParsed?: (section: SectionInstance, content: SectionInstance['content']) => void,
): ProblemIssue[] {
  const issues: ProblemIssue[] = [];
  const singletonsSeen = new Set<SectionType>();
  const lastIndex = composition.sections.length - 1;
  composition.sections.forEach((section, index) => {
    const definition = getSectionDefinition(section.type);
    const variant = getVariant(definition, section.variant);
    if (!variant) {
      issues.push({
        path: ['sections', index, 'variant'],
        code: 'invalid_variant',
        message: `Kiểu bố cục "${section.variant}" không có trong section ${definition.label}`,
      });
    }
    if (
      (definition.position === 'first' && index !== 0) ||
      (definition.position === 'last' && index !== lastIndex)
    ) {
      issues.push({
        path: ['sections', index, 'type'],
        code: 'invalid_position',
        message:
          definition.position === 'first'
            ? `${definition.label} phải là section đầu tiên của trang`
            : `${definition.label} phải là section cuối cùng của trang`,
      });
    }
    if (definition.singleton) {
      if (singletonsSeen.has(section.type)) {
        issues.push({
          path: ['sections', index, 'type'],
          code: 'duplicate_singleton',
          message: `Một trang chỉ có một section ${definition.label}`,
        });
      }
      singletonsSeen.add(section.type);
    }
    for (const [listKey, minimum] of Object.entries(variant?.listMin ?? {})) {
      const field = definition.fields.find((candidate) => candidate.key === listKey);
      const items = getAtPath(section.content, listKey);
      if (field?.kind === 'list' && Array.isArray(items) && items.length < minimum) {
        issues.push({
          path: ['sections', index, 'content', listKey],
          code: 'too_small',
          message: `Bố cục “${variant?.label ?? section.variant}” cần ít nhất ${minimum} ${listLabelsOf(section.type, section.variant, field).itemLabel.toLowerCase()}`,
        });
      }
    }
    for (const [listKey, maximum] of Object.entries(variant?.listMax ?? {})) {
      const field = definition.fields.find((candidate) => candidate.key === listKey);
      const items = getAtPath(section.content, listKey);
      // Over the field's own maximum the schema reports it below; one issue is enough.
      if (
        field?.kind === 'list' &&
        Array.isArray(items) &&
        items.length > maximum &&
        items.length <= field.max
      ) {
        issues.push({
          path: ['sections', index, 'content', listKey],
          code: 'too_big',
          message: `Bố cục “${variant?.label ?? section.variant}” có tối đa ${maximum} ${listLabelsOf(section.type, section.variant, field).itemLabel.toLowerCase()}`,
        });
      }
    }
    const result = definition.contentSchema.safeParse(section.content);
    if (!result.success) {
      for (const issue of result.error.issues) {
        issues.push({
          path: [
            'sections',
            index,
            'content',
            ...issue.path.map((part) => (typeof part === 'symbol' ? String(part) : part)),
          ],
          code: issue.code,
          message: issue.message,
        });
      }
      return;
    }
    onParsed?.(section, result.data);
  });
  return issues;
}

/**
 * Validates every section against its own definition and returns the composition as validated:
 * each content as its section schema parsed it, so keys no schema knows (in the content, a button,
 * a link) are dropped, sample and review paths that name no text field are dropped too, and motion
 * that changes nothing is left out (ADR-032). Store and publish this result, never the input.
 * Issues are those of `validateComposition`. The frame (`compositionSchema`) must already be valid.
 */
export function parseComposition(composition: Composition): CompositionParseResult {
  const sections: SectionInstance[] = [];
  const issues = checkSections(composition, (section, content) => {
    const known = samplePathCandidates({ ...section, content });
    const motion = storedSectionMotion(section.motion);
    sections.push({
      id: section.id,
      type: section.type,
      variant: section.variant,
      colorScheme: section.colorScheme,
      spacing: section.spacing,
      visibility: { desktop: section.visibility.desktop, mobile: section.visibility.mobile },
      mobileOrder: section.mobileOrder,
      content,
      samplePaths: [...new Set(section.samplePaths)].filter((path) => known.has(path)),
      reviewPaths: [...new Set(section.reviewPaths)].filter((path) => known.has(path)),
      ...(motion === undefined ? {} : { motion }),
    });
  });
  const motion = storedPageMotion(composition.motion);
  return issues.length > 0
    ? { success: false, issues }
    : {
        success: true,
        composition: {
          version: composition.version,
          ...(motion === undefined ? {} : { motion }),
          sections,
        },
        issues: [],
      };
}

/**
 * The issues of `parseComposition`, without building the parsed composition or its sample paths:
 * the editor runs it on every command, each keystroke included. An empty list means valid.
 */
export function validateComposition(composition: Composition): ProblemIssue[] {
  return checkSections(composition);
}
