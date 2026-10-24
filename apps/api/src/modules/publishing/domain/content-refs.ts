import {
  type Composition,
  type Cta,
  ctaSchema,
  type ImageRef,
  imageRefSchema,
  type SectionInstance,
  type Seo,
} from '@plp/contracts';
import { getAtPath, getSectionDefinition, type LeafField } from '@plp/sections/schema';

interface StoredLeaf {
  /** Content path, e.g. "items.1.image". */
  path: string;
  field: LeafField;
  value: unknown;
}

/**
 * Every leaf field stored in a section's content, list items expanded, including the fields the
 * current variant hides: switching variants keeps their values, so they still reference assets.
 */
function storedLeaves(section: Pick<SectionInstance, 'type' | 'content'>): StoredLeaf[] {
  const leaves: StoredLeaf[] = [];
  for (const field of getSectionDefinition(section.type).fields) {
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
        const path = `${field.key}.${index}.${itemField.key}`;
        leaves.push({ path, field: itemField, value: getAtPath(section.content, path) });
      }
    });
  }
  return leaves;
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
