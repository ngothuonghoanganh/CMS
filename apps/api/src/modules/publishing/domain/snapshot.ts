import { type Composition, EMPTY_COMPOSITION, EMPTY_SEO, type Seo } from '@plp/contracts';

/** What a release freezes and a draft edits: the address, the sections and the SEO settings. */
export interface PageSnapshot {
  slug: string;
  composition: Composition;
  seo: Seo;
}

/**
 * The page before its first release, used as the base of the first change summary. It keeps the
 * draft's slug: a page that was never live had no previous address, so there is no address change.
 */
export function emptyPageSnapshot(slug: string): PageSnapshot {
  return { slug, composition: EMPTY_COMPOSITION, seo: EMPTY_SEO };
}
