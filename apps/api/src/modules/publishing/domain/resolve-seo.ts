import type { Composition, PublicImage, PublicSeo } from '@plp/contracts';
import { heroContentSchema } from '@plp/sections/schema';
import type { PageSnapshot } from './snapshot.js';

/** The site settings SEO falls back to. */
export interface SeoSiteDefaults {
  name: string;
  defaultShareImageAssetId: string | null;
}

/** Heading of the first Hero section that has one. */
export function firstHeroHeading(composition: Composition): string | null {
  for (const section of composition.sections) {
    if (section.type !== 'hero') {
      continue;
    }
    const content = heroContentSchema.safeParse(section.content);
    const heading = content.success ? content.data.heading.trim() : '';
    if (heading !== '') {
      return heading;
    }
  }
  return null;
}

/** Public address of a page: the origin plus its slug ("/" for the home page). */
export function canonicalUrl(origin: string, slug: string): string {
  return `${origin}/${slug}`;
}

/**
 * The SEO a visitor's browser and search engines get (ADR-005, ADR-011): the title falls back to
 * the Hero heading, then the site name; the share image falls back to the site's default one.
 * `images` holds the public images of the site's assets, by asset id.
 */
export function resolveSeo(
  snapshot: PageSnapshot,
  site: SeoSiteDefaults,
  origin: string,
  images: Readonly<Record<string, PublicImage>>,
): PublicSeo {
  const title = snapshot.seo.title.trim();
  const shareImageId = snapshot.seo.shareImageAssetId ?? site.defaultShareImageAssetId;
  return {
    title: title !== '' ? title : (firstHeroHeading(snapshot.composition) ?? site.name),
    description: snapshot.seo.description,
    shareImage: shareImageId === null ? null : (images[shareImageId] ?? null),
    noindex: snapshot.seo.noindex,
    canonicalUrl: canonicalUrl(origin, snapshot.slug),
  };
}
