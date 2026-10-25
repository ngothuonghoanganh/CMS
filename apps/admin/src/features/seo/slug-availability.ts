import { endpoints } from '@plp/contracts';
import { queryOptions } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { siteQueryKeys } from '../dashboard/queries';

/**
 * Whether a page slug is free in the site (not another page's draft or live slug). `pageId` is the
 * page being edited: its own slugs never conflict. Shared by the SEO page and page creation.
 */
export function slugAvailabilityQuery(siteId: string, slug: string, pageId?: string) {
  return queryOptions({
    queryKey: [...siteQueryKeys.site(siteId), 'slug-availability', pageId ?? null, slug] as const,
    queryFn: ({ signal }) =>
      api(endpoints.slugAvailability, [siteId], {
        query: pageId === undefined ? { slug } : { slug, pageId },
        signal,
      }),
    staleTime: 10_000,
  });
}

/** How long typing must pause before a slug is checked. */
export const SLUG_CHECK_DELAY_MS = 400;
