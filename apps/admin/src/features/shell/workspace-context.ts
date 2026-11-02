import {
  can,
  endpoints,
  idSchema,
  type LeadCounts,
  type MeResponse,
  type Membership,
  type Site,
  type SiteListItem,
} from '@plp/contracts';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { requireMe, serverApi } from '../../lib/server-api';
import { workspaceHref } from './navigation';
import { pickSite, SITE_PREFERENCE_COOKIE } from './site-preference';
import { requireWorkspaceAddress } from './current-address';

/** The frame of a workspace screen (Sites, Vai trò & quyền): the workspace and a site for the sidebar. */
export interface WorkspaceContext {
  me: MeResponse;
  membership: Membership;
  /** Sites of the workspace the user may open, with their counts (ADR-028). */
  sites: SiteListItem[];
  /** The site the user opened last, for the sidebar; null in a workspace without one. */
  site: Site | null;
  pageCount: number;
  /** Members of the workspace for "Thành viên"; null for roles that do not manage members. */
  memberCount: number | null;
  /** Null without a site, and for roles that do not see leads (ADR-020). */
  leadCounts: LeadCounts | null;
}

/**
 * "Thành viên" in the sidebar counts the members of the workspace, for the roles that see it
 * (ADR-028). Every screen with the sidebar loads it with the rest of its frame.
 */
export async function loadMemberCount(membership: Membership): Promise<number | null> {
  if (!can(membership.role, 'members.manage')) {
    return null;
  }
  return (await serverApi(endpoints.roleCounts, [membership.workspace.id])).members;
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
    await requireWorkspaceAddress(membership.workspace);
    const [{ items: sites }, memberCount] = await Promise.all([
      serverApi(endpoints.listSites, [workspaceId]),
      loadMemberCount(membership),
    ]);
    const site = pickSite(sites, (await cookies()).get(SITE_PREFERENCE_COOKIE)?.value);
    if (site === null) {
      return { me, membership, sites, site, pageCount: 0, memberCount, leadCounts: null };
    }
    const [pageCount, leadCounts] = await Promise.all([
      serverApi(endpoints.countPages, [site.id]),
      can(membership.role, 'leads.view') ? serverApi(endpoints.leadCounts, [site.id]) : null,
    ]);
    return { me, membership, sites, site, pageCount: pageCount.count, memberCount, leadCounts };
  },
);
