import type { ResolvedNavigationItem } from '@payload/contracts';

export const PAGE_NAVIGATION_PORT = Symbol('PAGE_NAVIGATION_PORT');

export type ResolvedSiteNavigation = {
  main?: ResolvedNavigationItem[];
  footer?: ResolvedNavigationItem[];
};

export type NavigationResolutionOptions = {
  mode?: 'draft' | 'published';
};

/** Narrow navigation capabilities required by page lifecycle and delivery. */
export interface PageNavigationPort {
  validateInlineNavigationDocument(
    document: unknown,
    workspaceId: string,
    siteId?: string,
  ): Promise<void>;

  assertPageCanBeDeleted(
    siteId: string,
    pageId: string,
    workspaceId: string,
  ): Promise<void>;

  resolveForSite(
    siteId: string,
    workspaceId: string,
    options?: NavigationResolutionOptions,
  ): Promise<ResolvedSiteNavigation | undefined>;

  resolvePagePaths(
    siteId: string,
    workspaceId: string,
    pageIds: readonly string[],
    homePageId: string | undefined,
    mode?: 'draft' | 'published',
  ): Promise<Record<string, string>>;
}
