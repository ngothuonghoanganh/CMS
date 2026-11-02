import {
  type Composition,
  ctaSchema,
  EMPTY_IMAGE,
  imageRefSchema,
  type Link,
  type SectionInstance,
  type TemplateContentMode,
} from '@plp/contracts';
import { collectLeaves, type LeafField, samplePathsOf, setAtPath } from '@plp/sections/schema';

/*
 * What a workspace template version holds of a page (ADR-030), as pure functions: the version is
 * built from the page's composition, and its images are named by ids of the template's own or,
 * once made into a page, of the target site's assets.
 */

const NO_LINK = { kind: 'none' } as const;

/** Rewrites the stored leaves of one kind in a section, the fields its variant hides included. */
function rewriteLeaves(
  section: SectionInstance,
  kind: 'cta' | 'image',
  rewrite: (value: unknown, field: LeafField) => unknown,
): SectionInstance {
  let content = section.content;
  for (const leaf of collectLeaves(section, { includeHidden: true })) {
    if (leaf.field.kind !== kind) {
      continue;
    }
    const next = rewrite(leaf.value, leaf.field);
    if (next !== leaf.value) {
      content = setAtPath(content, leaf.path, next);
    }
  }
  return content === section.content ? section : { ...section, content };
}

/**
 * A button that leads to another page of the site leads nowhere in a template: pages belong to one
 * site, as images do (ADR-012), and the page made from it shows where to choose a new target.
 */
function withoutPageLinks(section: SectionInstance): SectionInstance {
  return rewriteLeaves(section, 'cta', (value) => {
    const cta = ctaSchema.safeParse(value);
    return cta.success && cta.data.link.kind === 'page' ? { ...cta.data, link: NO_LINK } : value;
  });
}

/**
 * The buttons without the source site's own phone number, Zalo and web addresses: they belong to
 * that business, as its texts do, and another site's page would call it. A button that may lead
 * anywhere gets "chưa chọn đích"; one that leads to one kind only (the quick contact's call and
 * Zalo buttons) keeps its kind with nothing to call. A button to a section stays: the section
 * comes with the template.
 */
function withoutContactTargets(section: SectionInstance): SectionInstance {
  return rewriteLeaves(section, 'cta', (value, field) => {
    const cta = ctaSchema.safeParse(value);
    if (!cta.success) {
      return value;
    }
    const { link } = cta.data;
    if (link.kind !== 'phone' && link.kind !== 'zalo' && link.kind !== 'url') {
      return value;
    }
    if (field.kind !== 'cta' || field.linkKinds === undefined) {
      return { ...cta.data, link: NO_LINK };
    }
    const untargeted: Link =
      link.kind === 'url' ? { kind: 'url', url: '' } : { kind: link.kind, phone: '' };
    return { ...cta.data, link: untargeted };
  });
}

function withoutImages(section: SectionInstance): SectionInstance {
  return rewriteLeaves(section, 'image', (value) => {
    const image = imageRefSchema.safeParse(value);
    return image.success && image.data.assetId !== null ? { ...EMPTY_IMAGE } : value;
  });
}

/**
 * The content a version keeps of a page's composition. Never a link to a page of the source site.
 * `sample` ("Đánh dấu toàn bộ chữ là chữ mẫu") marks every text and button label as sample text,
 * empties the image frames, like a system template, and drops the phone, Zalo and web targets of
 * the buttons; `keep` ("Giữ chữ và ảnh như hiện tại") keeps texts, sample marks, images and those
 * targets as they are: the agency chose to reuse that business's content (ADR-030).
 */
export function templateContentOf(
  composition: Composition,
  mode: TemplateContentMode,
): Composition {
  return {
    ...composition,
    sections: composition.sections.map((original) => {
      const section = withoutPageLinks(original);
      if (mode === 'keep') {
        return section;
      }
      const emptied = withoutContactTargets(withoutImages(section));
      // Sample text is replaced before publishing anyway: no sentence is left for the user to
      // check as one the AI wrote (ADR-031).
      return { ...emptied, samplePaths: samplePathsOf(emptied), reviewPaths: [] };
    }),
  };
}

/** Distinct asset ids the image fields hold, the hidden ones included, in page order. */
export function imageAssetIds(composition: Composition): string[] {
  const ids = new Set<string>();
  for (const section of composition.sections) {
    for (const leaf of collectLeaves(section, { includeHidden: true })) {
      if (leaf.field.kind !== 'image') {
        continue;
      }
      const image = imageRefSchema.safeParse(leaf.value);
      if (image.success && image.data.assetId !== null) {
        ids.add(image.data.assetId);
      }
    }
  }
  return [...ids];
}

/**
 * The composition with every image's asset id mapped: from the source site's ids to the template's
 * when a version is saved, from the template's to the target site's new assets when a page is made
 * from it. An id without a mapping empties its frame: a page only ever names its own site's assets.
 * Each use keeps its own description.
 */
export function withAssetIds(
  composition: Composition,
  ids: ReadonlyMap<string, string>,
): Composition {
  return {
    ...composition,
    sections: composition.sections.map((section) =>
      rewriteLeaves(section, 'image', (value) => {
        const image = imageRefSchema.safeParse(value);
        if (!image.success || image.data.assetId === null) {
          return value;
        }
        const mapped = ids.get(image.data.assetId);
        return mapped === undefined ? { ...EMPTY_IMAGE } : { ...image.data, assetId: mapped };
      }),
    ),
  };
}
