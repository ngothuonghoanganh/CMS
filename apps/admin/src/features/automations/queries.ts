/** TanStack Query keys of the automations screen, under the site's keys. */
export const automationQueryKeys = {
  all: (siteId: string) => ['sites', siteId, 'automations'] as const,
  list: (siteId: string) => ['sites', siteId, 'automations', 'list'] as const,
};
