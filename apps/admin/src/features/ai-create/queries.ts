/**
 * TanStack Query key of the workspace's AI uses, read through the site (ADR-031). Creating a page
 * with AI (board 20) and the editor's assistant (board 21) share it.
 */
export const aiQueryKeys = {
  usage: (siteId: string) => ['sites', siteId, 'ai', 'usage'] as const,
};
