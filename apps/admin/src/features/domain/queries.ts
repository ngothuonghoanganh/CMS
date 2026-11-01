/** Query keys of a site's custom domains (ADR-022). */
export const domainQueryKeys = {
  list: (siteId: string) => ['sites', siteId, 'domains'] as const,
};
