import {
  can,
  endpoints,
  idSchema,
  type LeadCounts,
  type MeResponse,
  type Membership,
  type Site,
} from '@plp/contracts';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { requireMe, serverApi } from '../../lib/server-api';
import { workspaceHref } from './navigation';
import { pickSite, SITE_PREFERENCE_COOKIE } from './site-preference';

/** The frame of a workspace screen (Vai trò & quyền): the workspace and a site for the sidebar. */
export interface WorkspaceContext {
  me: MeResponse;
  membership: Membership;
  /** Sites of the workspace the user may open. */
  sites: Site[];
  /** The site the user opened last, for the sidebar; null in a workspace without one. */
  site: Site | null;
  pageCount: number;
  /** Null without a site, and for roles that do not see leads (ADR-020). */
  leadCounts: LeadCounts | null;
}

/**
 * Loads the workspace context once per request; the layout, the page and `generateMetadata`
 * share it. A workspace the user does not belong to renders the 404 page (ADR-003).
 */
export const loadWorkspaceContext = cache(
  async (workspaceId: string): Promise<WorkspaceContext> => {
    if (!idSchema.safeParse(workspaceId).success) {
      notFound();
    }
    const me = await requireMe(workspaceHref(workspaceId));
    const membership = me.memberships.find((item) => item.workspace.id === workspaceId);
    if (membership === undefined) {
      notFound();
    }
    const { items: sites } = await serverApi(endpoints.listSites, [workspaceId]);
    const site = pickSite(sites, (await cookies()).get(SITE_PREFERENCE_COOKIE)?.value);
    if (site === null) {
      return { me, membership, sites, site, pageCount: 0, leadCounts: null };
    }
    const [pageCount, leadCounts] = await Promise.all([
      serverApi(endpoints.countPages, [site.id]),
      can(membership.role, 'leads.view') ? serverApi(endpoints.leadCounts, [site.id]) : null,
    ]);
    return { me, membership, sites, site, pageCount: pageCount.count, leadCounts };
  },
);
