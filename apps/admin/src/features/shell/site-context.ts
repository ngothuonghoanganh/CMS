import { endpoints, idSchema, type MeResponse, type Membership, type Site } from '@plp/contracts';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { ApiError } from '../../lib/api-core';
import { requireMe, serverApi } from '../../lib/server-api';
import { siteHref } from './navigation';

/** Everything the workspace frame needs about the current site and the signed-in user. */
export interface SiteContext {
  me: MeResponse;
  /** The user's membership in the workspace that owns the site. */
  membership: Membership;
  site: Site;
  /** Sites of the same workspace, for the site switcher. */
  sites: Site[];
  /** Number of pages of the site, for the sidebar. */
  pageCount: number;
}

async function loadSite(siteId: string): Promise<Site> {
  try {
    return await serverApi(endpoints.getSite, [siteId]);
  } catch (error) {
    // A site of another workspace is a 404 too (ARCHITECTURE ADR-003).
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }
}

/**
 * Loads the site context once per request; the layout, the page and `generateMetadata` share it.
 * Unknown sites, and sites of a workspace the user does not belong to, render the 404 page.
 */
export const loadSiteContext = cache(async (siteId: string): Promise<SiteContext> => {
  if (!idSchema.safeParse(siteId).success) {
    notFound();
  }
  const me = await requireMe(siteHref(siteId));
  const site = await loadSite(siteId);
  const membership = me.memberships.find((item) => item.workspace.id === site.workspaceId);
  if (membership === undefined) {
    notFound();
  }
  // The count endpoint skips the page evaluation that `listPages` runs for statuses and checks.
  const [siteList, pageCount] = await Promise.all([
    serverApi(endpoints.listSites, [site.workspaceId]),
    serverApi(endpoints.countPages, [site.id]),
  ]);
  return { me, membership, site, sites: siteList.items, pageCount: pageCount.count };
});
