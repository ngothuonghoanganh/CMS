export const SITE_NAVIGATION_PORT = Symbol('SITE_NAVIGATION_PORT');

export type SiteNavigationReference = {
  id: string;
  key: string;
};

/** Narrow read capability used when assembling a site's public manifest. */
export interface SiteNavigationPort {
  listReferences(
    workspaceId: string,
    siteId: string,
  ): Promise<readonly SiteNavigationReference[]>;
}
