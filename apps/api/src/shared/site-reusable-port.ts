import type { DesignTokenUsageResponse, SiteDesignSystem } from '@payload/contracts';

export const SITE_REUSABLE_PORT = Symbol('SITE_REUSABLE_PORT');

/**
 * Narrow reusable capabilities required by site-level workflows. The reusable
 * platform remains an optional implementation behind this composition-root
 * boundary.
 */
export interface SiteReusablePort {
  assertDesignTokenDependenciesAvailable(
    workspaceId: string,
    siteId: string,
    designSystem: SiteDesignSystem,
  ): Promise<void>;

  assertDesignTokenRemovalSafe(
    workspaceId: string,
    siteId: string,
    nextDesignSystem: SiteDesignSystem,
  ): Promise<void>;

  getDesignTokenUsage(
    workspaceId: string,
    siteId: string,
    tokenId: string,
  ): Promise<DesignTokenUsageResponse>;

  publishReferencedForSite(workspaceId: string, siteId: string): Promise<void>;
}
