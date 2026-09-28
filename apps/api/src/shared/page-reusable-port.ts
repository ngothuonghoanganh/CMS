import type { PagePayload, ReusableRuntime, SiteDesignSystem } from '@payload/contracts';

export const PAGE_REUSABLE_PORT = Symbol('PAGE_REUSABLE_PORT');

/**
 * Narrow capability used by core page workflows. The reusable library remains
 * an optional platform implementation behind this composition-root boundary.
 */
export interface PageReusablePort {
  assertDependenciesAvailable(
    workspaceId: string,
    siteId: string,
    payload: PagePayload,
  ): Promise<void>;

  assertDesignTokenDependenciesAvailable(
    workspaceId: string,
    siteId: string,
    designSystem: SiteDesignSystem,
    additionalValues?: readonly unknown[],
  ): Promise<void>;

  resolveForPayload(
    workspaceId: string,
    siteId: string,
    payload: PagePayload,
    published: boolean,
  ): Promise<ReusableRuntime[]>;
}
