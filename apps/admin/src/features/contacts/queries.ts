import type { ContactListQuery } from '@plp/contracts';

/**
 * TanStack Query keys of the customers screen, under the site's keys. Invalidate
 * `contactQueryKeys.all(id)` after anything that changes profiles.
 */
export const contactQueryKeys = {
  all: (siteId: string) => ['sites', siteId, 'contacts'] as const,
  /** Every page of every view. */
  lists: (siteId: string) => ['sites', siteId, 'contacts', 'list'] as const,
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
  /** A profile (board 23): its card, tasks and meetings, and its timeline. */
  profile: (siteId: string, contactId: string) =>
    ['sites', siteId, 'contacts', 'profile', contactId] as const,
  timeline: (siteId: string, contactId: string) =>
    ['sites', siteId, 'contacts', 'profile', contactId, 'timeline'] as const,
};
