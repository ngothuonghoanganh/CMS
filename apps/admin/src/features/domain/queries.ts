/** Query keys of a site's custom domains (ADR-022). */
export const domainQueryKeys = {
  list: (siteId: string) => ['sites', siteId, 'domains'] as const,
  /** Under the list: whatever changes the domains checks them again. */
  availability: (siteId: string, hostname: string) =>
    ['sites', siteId, 'domains', 'availability', hostname] as const,
};
