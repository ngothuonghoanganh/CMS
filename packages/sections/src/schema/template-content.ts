import { type Composition, linkSchema, type TemplateSection } from '@plp/contracts';
import { setAtPath } from './paths.js';
import { collectLeaves, getSectionDefinition, pageCapturesLeads } from './registry.js';

/*
 * Compositions as templates carry them (ADR-030): a workspace template's sections reach a page
 * with new ids, and its outline and thumbnail come from its own content.
 */

/**
 * The composition with a new id for every section, from `newId`, and every button that led to one
 * of its sections leading to that section's new id. A button leading to a section that is not on
 * the page keeps its target: the publish checks report it as they do today. Nothing else changes.
 */
export function withFreshSectionIds(composition: Composition, newId: () => string): Composition {
  const ids = new Map(composition.sections.map((section) => [section.id, newId()]));
  return {
    ...composition,
    sections: composition.sections.map((section) => {
      let content = section.content;
      for (const leaf of collectLeaves(section, { includeHidden: true })) {
        if (leaf.field.kind !== 'cta') {
          continue;
        }
        const link = linkSchema.safeParse(
          (leaf.value as { link?: unknown } | undefined)?.link ?? null,
        );
        const target = link.success && link.data.kind === 'section' ? link.data.sectionId : null;
        const renamed = target === null ? undefined : ids.get(target);
        if (renamed !== undefined) {
          content = setAtPath(content, `${leaf.path}.link`, {
            kind: 'section',
            sectionId: renamed,
          });
        }
      }
      const id = ids.get(section.id);
      if (id === undefined) {
        throw new Error(`No new id for section ${section.id}`);
      }
      return { ...section, id, content };
    }),
  };
}

/** Characters of a section's summary its outline line shows, "…" included. */
const OUTLINE_SUMMARY_MAX = 60;

function shortened(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > OUTLINE_SUMMARY_MAX
    ? `${trimmed.slice(0, OUTLINE_SUMMARY_MAX - 1).trimEnd()}…`
    : trimmed;
}

/**
 * The outline of a workspace template ("Gồm 7 section") and what its thumbnail draws: each
 * section's type, variant and color scheme, labelled "Hero · Niềng răng trong suốt…" from the
 * section's own summary, as the page structure of the editor shows it.
 */
export function compositionOutline(composition: Composition): TemplateSection[] {
  return composition.sections.map((section) => {
    const definition = getSectionDefinition(section.type);
    const summary = shortened(definition.summarize(section.content, section.variant));
    return {
      type: section.type,
      variant: section.variant,
      colorScheme: section.colorScheme,
      label: summary === '' ? definition.label : `${definition.label} · ${summary}`,
    };
  });
}

/** "Có form": the composition holds the lead form. */
export function compositionHasForm(composition: Composition): boolean {
  return pageCapturesLeads(composition);
}
