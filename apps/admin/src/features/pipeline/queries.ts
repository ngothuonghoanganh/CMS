/**
 * TanStack Query keys of the pipeline, under the site's keys. Invalidate
 * `pipelineQueryKeys.all(id)` after anything that creates or moves an opportunity.
 */
export const pipelineQueryKeys = {
  all: (siteId: string) => ['sites', siteId, 'pipeline'] as const,
  board: (siteId: string, ownerId: string) => ['sites', siteId, 'pipeline', ownerId] as const,
};
