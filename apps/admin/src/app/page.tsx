import { can, endpoints, type MeResponse } from '@plp/contracts';
import { ToastProvider } from '@plp/ui';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { workspaceHome } from '../features/shell/admin-address';
import { currentAddress } from '../features/shell/current-address';
import { siteHref } from '../features/shell/navigation';
import { NotMember } from '../features/workspaces/NotMember';
import { WorkspacePicker } from '../features/workspaces/WorkspacePicker';
import { FormCard } from '../features/shell/FormCard';
import { CenteredPage } from '../features/shell/CenteredPage';
import {
  pickMembership,
  WORKSPACE_PREFERENCE_COOKIE,
} from '../features/shell/workspace-preference';
import { ApiError } from '../lib/api-core';
import { requireMe, serverApi } from '../lib/server-api';

/**
 * Entry point. With workspace addresses (ADR-025): the common address opens the user's only
 * workspace at its address, or lets them pick one (screen 35); a workspace's address opens that
 * workspace, or says the account does not belong to it (screen 36). At the single address of a
 * deployment without them, see `singleAddressHome`.
 */
export default async function HomePage() {
  const me = await requireMe();
  const address = await currentAddress();
  if (address.kind === 'common') {
    const [only, ...others] = me.memberships;
    if (only !== undefined && others.length === 0) {
      redirect(`${workspaceHome(address.addresses, only.workspace.slug)}/`);
    }
    return (
      <ToastProvider>
        <WorkspacePicker
          user={me.user}
          memberships={me.memberships}
          template={address.addresses.template}
          commonOrigin={address.addresses.commonOrigin}
        />
      </ToastProvider>
    );
  }
  if (address.kind === 'workspace') {
    const membership = me.memberships.find((item) => item.workspace.slug === address.slug);
    if (membership === undefined) {
      return (
        <ToastProvider>
          <CenteredPage width="md">
            <NotMember
              user={me.user}
              host={new URL(workspaceHome(address.addresses, address.slug)).host}
              commonOrigin={address.addresses.commonOrigin}
            />
          </CenteredPage>
        </ToastProvider>
      );
    }
    // The workspace of this address stays open, even without a site to show.
    const [first] = (await sitesOf(membership.workspace.id)) ?? [];
    redirect(
      first === undefined
        ? `/sites/new?workspace=${encodeURIComponent(membership.workspace.id)}`
        : siteHref(first.id),
    );
  }
  return singleAddressHome(me);
}

/**
 * Opens the first site of the preferred workspace, or site creation when the workspace has none
 * yet. Without a workspace chosen (a first sign-in), a member who cannot create sites in the first
 * one opens another workspace's first site, or creates one where they may, instead of a page that
 * only says to wait.
 */
async function singleAddressHome(me: MeResponse) {
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
