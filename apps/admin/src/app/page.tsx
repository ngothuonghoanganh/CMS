import { can, endpoints } from '@plp/contracts';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { siteHref } from '../features/shell/navigation';
import { FormCard } from '../features/shell/FormCard';
import { CenteredPage } from '../features/shell/CenteredPage';
import {
  pickMembership,
  WORKSPACE_PREFERENCE_COOKIE,
} from '../features/shell/workspace-preference';
import { ApiError } from '../lib/api-core';
import { requireMe, serverApi } from '../lib/server-api';

/**
 * Entry point: opens the first site of the preferred workspace, or site creation when the
 * workspace has none yet. Without a workspace chosen (a first sign-in), a member who cannot
 * create sites in the first one opens another workspace's first site, or creates one where they
 * may, instead of a page that only says to wait.
 */
export default async function HomePage() {
  const me = await requireMe();
  const preferred = (await cookies()).get(WORKSPACE_PREFERENCE_COOKIE)?.value;
  const membership = pickMembership(me.memberships, preferred);
  if (membership === null) {
    return (
      <CenteredPage>
        <FormCard
          title="Chưa có workspace"
          description="Tài khoản của bạn chưa thuộc workspace nào. Hãy nhờ Chủ sở hữu hoặc Quản trị của agency thêm bạn vào workspace."
        >
          {null}
        </FormCard>
      </CenteredPage>
    );
  }
  const [first] = (await sitesOf(membership.workspace.id)) ?? [];
  if (first !== undefined) {
    redirect(siteHref(first.id));
  }
  // A workspace the user chose (switcher, invitation) stays open, even without a site to show.
  const chosen = membership.workspace.id === preferred;
  if (chosen || can(membership.role, 'sites.manage')) {
    redirect('/sites/new');
  }
  // None chosen and nothing here: another workspace's site, or one where they may create it.
  const others = me.memberships.filter((other) => other !== membership);
  const left = new Set<string>();
  for (const other of others) {
    const sites = await sitesOf(other.workspace.id);
    if (sites === null) {
      left.add(other.workspace.id);
    } else if (sites[0] !== undefined) {
      redirect(siteHref(sites[0].id));
    }
  }
  const creator = others.find(
    (other) => !left.has(other.workspace.id) && can(other.role, 'sites.manage'),
  );
  redirect(
    creator === undefined
      ? '/sites/new'
      : `/sites/new?workspace=${encodeURIComponent(creator.workspace.id)}`,
  );
}

/** The sites of a workspace; null when the user left it since `/auth/me` was read. */
async function sitesOf(workspaceId: string) {
  try {
    return (await serverApi(endpoints.listSites, [workspaceId])).items;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}
