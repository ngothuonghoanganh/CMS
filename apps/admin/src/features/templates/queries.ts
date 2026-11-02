import { endpoints, type TemplateSiteReadiness } from '@plp/contracts';
import { api } from '../../lib/api';

/** TanStack Query keys of the template library (ADR-030). */
export const templateQueryKeys = {
  all: (workspaceId: string) => ['workspaces', workspaceId, 'templates'] as const,
  /** What a site still needs for a template's form; it changes with the site's settings only. */
  readiness: (workspaceId: string, templateId: string, siteId: string) =>
    ['workspaces', workspaceId, 'templates', templateId, 'site', siteId] as const,
};

/** "Cần có trước khi xuất bản" of one site, read with the template (`?siteId=`). */
export function readinessQuery(workspaceId: string, templateId: string, siteId: string) {
  return {
    queryKey: templateQueryKeys.readiness(workspaceId, templateId, siteId),
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<TemplateSiteReadiness> => {
      const detail = await api(endpoints.getTemplate, [workspaceId, templateId], {
        query: { siteId },
        signal,
      });
      if (detail.site === null) {
        throw new Error(`The template answered without the site ${siteId} it was asked about`);
      }
      return detail.site;
    },
  };
}
