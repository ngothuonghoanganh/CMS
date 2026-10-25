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
  SectionDefinition,
  SectionVariant,
} from './define.js';
import { getAtPath } from './paths.js';
import { benefitsSection } from './sections/benefits.js';
import { ctaBandSection } from './sections/cta-band.js';
import { faqSection } from './sections/faq.js';
import { footerSection } from './sections/footer.js';
import { heroSection } from './sections/hero.js';
import { navbarSection } from './sections/navbar.js';
import { testimonialsSection } from './sections/testimonials.js';

function widen<C extends Record<string, unknown>>(
  definition: SectionDefinition<C>,
): AnySectionDefinition {
  return definition;
}

/** Every section type maps to exactly one definition; the type checker enforces completeness. */
export const sectionDefinitions: { readonly [T in SectionType]: AnySectionDefinition } = {
  navbar: widen(navbarSection),
  hero: widen(heroSection),
  benefits: widen(benefitsSection),
  testimonials: widen(testimonialsSection),
  faq: widen(faqSection),
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
  const content = definition.sampleContent();
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
  };
}

/**
 * Validates every section against its own definition. Returns issues with paths relative to the
 * composition, e.g. ["sections", 2, "content", "heading"]. An empty list means valid.
 */
export function validateComposition(composition: Composition): ProblemIssue[] {
  const issues: ProblemIssue[] = [];
  const singletonsSeen = new Set<SectionType>();
  composition.sections.forEach((section, index) => {
    const definition = getSectionDefinition(section.type);
    if (!getVariant(definition, section.variant)) {
      issues.push({
        path: ['sections', index, 'variant'],
        code: 'invalid_variant',
        message: `Kiểu bố cục "${section.variant}" không có trong section ${definition.label}`,
      });
    }
    const lastIndex = composition.sections.length - 1;
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
    const variant = getVariant(definition, section.variant);
    for (const [listKey, minimum] of Object.entries(variant?.listMin ?? {})) {
      const field = definition.fields.find((candidate) => candidate.key === listKey);
      const items = getAtPath(section.content, listKey);
      if (field?.kind === 'list' && Array.isArray(items) && items.length < minimum) {
        issues.push({
          path: ['sections', index, 'content', listKey],
          code: 'too_small',
          message: `Bố cục “${variant?.label ?? section.variant}” cần ít nhất ${minimum} ${field.itemLabel.toLowerCase()}`,
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
    }
  });
  return issues;
}
