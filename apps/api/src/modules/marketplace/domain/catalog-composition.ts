import { isDeepStrictEqual } from 'node:util';
import {
  type Composition,
  imageRefSchema,
  linkSchema,
  type ProblemIssue,
  type SectionInstance,
} from '@plp/contracts';
import { collectLeaves, parseComposition, samplePathsOf } from '@plp/sections/schema';

/*
 * What a composition of the marketplace catalog must be (ADR-036), as a pure check the API runs on
 * every version at startup. Like a system template (ADR-030): only sections, variants, color
 * schemes and presets of the registry, every text sample text, no image and no button to another
 * page of the site. And exactly as the registry parses it, so the file is what a page receives.
 */

export type CatalogCompositionCheck =
  { valid: true; composition: Composition } | { valid: false; problems: string[] };

function at(path: readonly (string | number)[]): string {
  return path.join('.');
}

function registryProblems(issues: readonly ProblemIssue[]): string[] {
  return issues.map((issue) => `${at(issue.path)}: ${issue.message}`);
}

/** Images, links to pages and links to sections the page does not have, in one section. */
function contentProblems(
  section: SectionInstance,
  index: number,
  sectionIds: ReadonlySet<string>,
): string[] {
  const problems: string[] = [];
  // Hidden fields too: a variant switch shows them again.
  for (const leaf of collectLeaves(section, { includeHidden: true })) {
    const path = at(['sections', index, 'content', leaf.path]);
    if (leaf.field.kind === 'image') {
      const image = imageRefSchema.safeParse(leaf.value);
      if (image.success && image.data.assetId !== null) {
        problems.push(`${path}: holds an image; a marketplace template has empty image frames`);
      }
      continue;
    }
    if (leaf.field.kind !== 'cta') {
      continue;
    }
    const link = linkSchema.safeParse((leaf.value as { link?: unknown } | undefined)?.link);
    if (!link.success) {
      continue;
    }
    if (link.data.kind === 'page') {
      problems.push(`${path}: links to a page; pages belong to one site`);
    } else if (link.data.kind === 'section' && !sectionIds.has(link.data.sectionId)) {
      problems.push(`${path}: links to section "${link.data.sectionId}", not on this page`);
    }
  }
  return problems;
}

/** Every text and button label is sample text, which the publish checks remind to replace. */
function sampleProblems(section: SectionInstance, index: number): string[] {
  const expected = new Set(samplePathsOf(section));
  const marked = new Set(section.samplePaths);
  const missing = [...expected].filter((path) => !marked.has(path));
  const problems = missing.map(
    (path) => `${at(['sections', index, 'samplePaths'])}: "${path}" is not marked as sample text`,
  );
  if (section.reviewPaths.length > 0) {
    problems.push(`${at(['sections', index, 'reviewPaths'])}: a template has no text to review`);
  }
  return problems;
}

/**
 * The composition as the registry parses it, or what is wrong with it. `composition` has passed
 * `compositionSchema` (the frame), as the catalog schema checks it.
 */
export function checkCatalogComposition(composition: Composition): CatalogCompositionCheck {
  if (composition.sections.length === 0) {
    return { valid: false, problems: ['sections: a template has at least one section'] };
  }
  const parsed = parseComposition(composition);
  if (!parsed.success) {
    return { valid: false, problems: registryProblems(parsed.issues) };
  }
  const problems: string[] = [];
  parsed.composition.sections.forEach((section, index) => {
    if (!isDeepStrictEqual(section, composition.sections[index])) {
      problems.push(
        `sections.${index}: differs from what the registry makes of it; write it as parsed (no key its schema does not know, sample paths of its texts only, no motion that changes nothing)`,
      );
    }
  });
  if (!isDeepStrictEqual(parsed.composition.motion, composition.motion)) {
    problems.push('motion: differs from what the registry makes of it; leave out the default');
  }
  const sectionIds = new Set(parsed.composition.sections.map((section) => section.id));
  parsed.composition.sections.forEach((section, index) => {
    problems.push(
      ...contentProblems(section, index, sectionIds),
      ...sampleProblems(section, index),
    );
  });
  return problems.length > 0
    ? { valid: false, problems }
    : { valid: true, composition: parsed.composition };
}
