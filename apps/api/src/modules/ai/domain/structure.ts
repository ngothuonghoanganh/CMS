import type {
  AiStructureItem,
  Composition,
  PageGoal,
  ProblemIssue,
  SectionInstance,
} from '@plp/contracts';
import {
  buildCompositionFromGoal,
  createSectionInstance,
  getSectionDefinition,
  getVariant,
  pageStyleSchemes,
  parseComposition,
  setAtPath,
} from '@plp/sections/schema';

/**
 * The draft an AI job starts from (ADR-031): the sections of the structure the user arranged, in
 * order, each with sample text that the AI then replaces. Pure, unit-tested.
 */

export interface StructureInput {
  structure: readonly AiStructureItem[];
  goal: PageGoal;
  siteName: string;
  /** A fresh section id for each section. */
  newId: () => string;
}

export type StructureResult =
  { ok: true; composition: Composition } | { ok: false; issues: ProblemIssue[] };

/** Ids of the blueprint, never stored: only its sections' content is taken. */
function blueprintIds(): () => string {
  let next = 0;
  return () => {
    next += 1;
    return `blueprint${String(next).padStart(4, '0')}`;
  };
}

function variantIssues(structure: readonly AiStructureItem[]): ProblemIssue[] {
  return structure.flatMap((item, index): ProblemIssue[] => {
    const definition = getSectionDefinition(item.type);
    return getVariant(definition, item.variant)
      ? []
      : [
          {
            path: ['structure', index, 'variant'],
            code: 'invalid_variant',
            message: `Kiểu bố cục "${item.variant}" không có trong section ${definition.label}`,
          },
        ];
  });
}

/**
 * The composition of a structure, as the registry parses it, or the issues of the structure with
 * paths into the request ("structure.3.type"). A section the goal's blueprint also has takes its
 * goal-specific sample copy ("Vì sao chọn {site}"), so a section the AI cannot write still reads
 * well; others take the section's own sample. Colors follow the "calm" rhythm of goal pages, and
 * the Hero's main button leads to the form when the page has one, as on goal pages (ADR-016).
 */
export function compositionFromStructure(input: StructureInput): StructureResult {
  const invalid = variantIssues(input.structure);
  if (invalid.length > 0) {
    return { ok: false, issues: invalid };
  }
  const pool: SectionInstance[] = [
    ...buildCompositionFromGoal({
      goal: input.goal,
      brief: { offer: '', audience: '', phone: '' },
      style: 'calm',
      siteName: input.siteName,
      newId: blueprintIds(),
    }).sections,
  ];
  const ids = input.structure.map(() => input.newId());
  const formIndex = input.structure.findIndex((item) => item.type === 'lead_form');
  const formId = formIndex === -1 ? null : (ids[formIndex] ?? null);
  const schemes = pageStyleSchemes(
    'calm',
    input.structure.map((item) => item.type),
  );
  const sections = input.structure.map((item, index): SectionInstance => {
    const id = ids[index];
    if (id === undefined) {
      throw new Error(`No section id for position ${index}`);
    }
    const match = pool.findIndex(
      (candidate) => candidate.type === item.type && candidate.variant === item.variant,
    );
    const [fromBlueprint] = match === -1 ? [] : pool.splice(match, 1);
    const base = fromBlueprint ?? createSectionInstance(item.type, item.variant, id);
    const section: SectionInstance = {
      ...base,
      id,
      colorScheme: schemes[index] ?? base.colorScheme,
    };
    return item.type === 'hero'
      ? {
          ...section,
          content: setAtPath(
            section.content,
            'primaryCta.link',
            formId === null ? { kind: 'none' } : { kind: 'section', sectionId: formId },
          ),
        }
      : section;
  });
  const parsed = parseComposition({ version: 1, sections });
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.issues.map((issue) => ({
        ...issue,
        path: ['structure', ...issue.path.slice(1)],
      })),
    };
  }
  return { ok: true, composition: parsed.composition };
}
