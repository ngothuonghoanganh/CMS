import {
  type Composition,
  type Cta,
  ctaSchema,
  type ImageRef,
  imageRefSchema,
  type SectionInstance,
  type Seo,
} from '@plp/contracts';
import { collectLeaves, type LeafOccurrence } from '@plp/sections/schema';

/**
 * Every leaf field stored in a section's content, list items expanded, including the fields the
 * current variant hides: switching variants keeps their values, so they still reference assets.
 */
function storedLeaves(section: SectionInstance): LeafOccurrence[] {
  return collectLeaves(section, { includeHidden: true });
}

export interface ImageOccurrence {
  sectionIndex: number;
  path: string;
  image: ImageRef;
}

/** Image fields of a composition that point at an asset, in page order. */
export function imageOccurrences(composition: Composition): ImageOccurrence[] {
  return composition.sections.flatMap((section, sectionIndex) =>
    storedLeaves(section).flatMap((leaf): ImageOccurrence[] => {
      if (leaf.field.kind !== 'image') {
        return [];
      }
      const parsed = imageRefSchema.safeParse(leaf.value);
      return parsed.success && parsed.data.assetId !== null
        ? [{ sectionIndex, path: leaf.path, image: parsed.data }]
        : [];
    }),
  );
}

export interface CtaOccurrence {
  sectionIndex: number;
  path: string;
  cta: Cta;
}

/** Every button and link of a composition, in page order. */
export function ctaOccurrences(composition: Composition): CtaOccurrence[] {
  return composition.sections.flatMap((section, sectionIndex) =>
    storedLeaves(section).flatMap((leaf): CtaOccurrence[] => {
      if (leaf.field.kind !== 'cta') {
        return [];
      }
      const parsed = ctaSchema.safeParse(leaf.value);
      return parsed.success ? [{ sectionIndex, path: leaf.path, cta: parsed.data }] : [];
    }),
  );
}

/** Distinct asset ids referenced by image fields and the share image, in first-use order. */
export function referencedAssetIds(snapshot: { composition: Composition; seo: Seo }): string[] {
  const ids = imageOccurrences(snapshot.composition).flatMap(({ image }) =>
    image.assetId === null ? [] : [image.assetId],
  );
  if (snapshot.seo.shareImageAssetId !== null) {
    ids.push(snapshot.seo.shareImageAssetId);
  }
  return [...new Set(ids)];
}

/** Distinct ids of the pages the composition's buttons and links lead to. */
export function linkedPageIds(composition: Composition): string[] {
  return [
    ...new Set(
      ctaOccurrences(composition).flatMap(({ cta }) =>
        cta.link.kind === 'page' ? [cta.link.pageId] : [],
      ),
    ),
  ];
}
