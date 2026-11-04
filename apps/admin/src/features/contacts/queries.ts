import type { ContactListQuery } from '@plp/contracts';

/**
 * TanStack Query keys of the customers screen, under the site's keys. Invalidate
 * `contactQueryKeys.all(id)` after anything that changes profiles.
 */
export const contactQueryKeys = {
  all: (siteId: string) => ['sites', siteId, 'contacts'] as const,
  list: (siteId: string, query: ContactListQuery) =>
    [
      'sites',
      siteId,
      'contacts',
      'list',
      query.view,
      query.ownerId ?? null,
      query.tag ?? null,
      query.q ?? null,
      query.cursor ?? null,
    ] as const,
  options: (siteId: string) => ['sites', siteId, 'contacts', 'options'] as const,
  suggestions: (siteId: string) => ['sites', siteId, 'contacts', 'suggestions'] as const,
};
