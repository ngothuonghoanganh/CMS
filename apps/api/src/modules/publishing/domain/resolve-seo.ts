import type { PublicImage, PublicSeo } from '@plp/contracts';
import { seoTitleOf } from '@plp/sections/schema';
import type { SitePresentation } from './site-presentation.js';
import type { PageSnapshot } from './snapshot.js';

/**
 * The site settings SEO falls back to. For a live page they come from its release's snapshot
 * (ADR-015), never from the current site record.
 */
export type SeoSiteDefaults = Pick<SitePresentation, 'name' | 'defaultShareImageAssetId'>;

/** Public address of a page: the origin plus its slug ("/" for the home page). */
export function canonicalUrl(origin: string, slug: string): string {
  return `${origin}/${slug}`;
}

/**
 * The SEO a visitor's browser and search engines get (ADR-005, ADR-011): the title falls back to
 * the Hero heading, then the site name (`seoTitleOf`, the rule the admin previews use too); the
 * share image falls back to the site's default one.
 * `images` holds the public images of the site's assets, by asset id.
 */
export function resolveSeo(
  snapshot: PageSnapshot,
  site: SeoSiteDefaults,
  origin: string,
  images: Readonly<Record<string, PublicImage>>,
): PublicSeo {
  const shareImageId = snapshot.seo.shareImageAssetId ?? site.defaultShareImageAssetId;
  return {
    title: seoTitleOf(snapshot.seo.title, snapshot.composition, site.name),
    description: snapshot.seo.description,
    shareImage: shareImageId === null ? null : (images[shareImageId] ?? null),
    noindex: snapshot.seo.noindex,
    canonicalUrl: canonicalUrl(origin, snapshot.slug),
  };
}
