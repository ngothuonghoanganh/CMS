import type { Composition } from '@plp/contracts';
import { heroContentSchema } from './sections/hero.js';

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

/**
 * The `<title>` (and share title) of a published page (ADR-005, ADR-011): its SEO title, else the
 * first Hero heading, else the site name. One rule for the admin previews and public delivery.
 */
export function seoTitleOf(seoTitle: string, composition: Composition, siteName: string): string {
  const own = seoTitle.trim();
  return own !== '' ? own : (firstHeroHeading(composition) ?? siteName);
}
