import { can, endpoints, holdersOf, type Membership } from '@plp/contracts';
import { ButtonLink, ToastProvider } from '@plp/ui';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { parseAdminEnv } from '../../../env';
import { CenteredPage } from '../../../features/shell/CenteredPage';
import { FormCard } from '../../../features/shell/FormCard';
import { currentAddress, requireWorkspaceAddress } from '../../../features/shell/current-address';
import { siteHref } from '../../../features/shell/navigation';
import {
  pickMembership,
  WORKSPACE_PREFERENCE_COOKIE,
} from '../../../features/shell/workspace-preference';
import { CreateSiteForm } from '../../../features/sites/CreateSiteForm';
import { OtherWorkspaces } from '../../../features/workspaces/OtherWorkspaces';
import { SignOutButton } from '../../../features/workspaces/SignOutButton';
import styles from '../../../features/workspaces/WorkspacePicker.module.css';
import { requireMe, serverApi } from '../../../lib/server-api';

export const metadata: Metadata = { title: 'Tạo site khách hàng' };

/**
 * `?workspace=` (from the sidebar) wins when the user is a member; then the workspace of this
 * address (ADR-025); then the remembered one.
 */
async function chooseMembership(
  memberships: readonly Membership[],
  requested: string | string[] | undefined,
): Promise<Membership | null> {
  const fromQuery = memberships.find((item) => item.workspace.id === requested);
  if (fromQuery !== undefined) {
    return fromQuery;
  }
  const address = await currentAddress();
  if (address.kind === 'workspace') {
    const here = memberships.find((item) => item.workspace.slug === address.slug);
    if (here === undefined) {
      // The start page says the account does not belong to this address (screen 36).
      redirect('/');
    }
    return here;
  }
  const preferred = (await cookies()).get(WORKSPACE_PREFERENCE_COOKIE)?.value;
  return pickMembership(memberships, preferred);
}

export default async function NewSitePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await requireMe('/sites/new');
  const membership = await chooseMembership(me.memberships, (await searchParams).workspace);
  if (membership === null) {
    return (
      <ToastProvider>
        <CenteredPage width="md">
          <FormCard
            title="Tạo site khách hàng"
            description="Tài khoản của bạn chưa thuộc workspace nào, nên chưa thể tạo site."
          >
            <div className={styles.actions}>
              <SignOutButton />
            </div>
          </FormCard>
        </CenteredPage>
      </ToastProvider>
    );
  }

  await requireWorkspaceAddress(membership.workspace);
  const { items: sites } = await serverApi(endpoints.listSites, [membership.workspace.id]);
  const firstSite = sites[0];
  const backHref = firstSite === undefined ? null : siteHref(firstSite.id);
  const workspaceName = membership.workspace.name;

  if (!can(membership.role, 'sites.manage')) {
    // Without a site to go back to, the page still leads somewhere: the user's other workspaces
    // (at the common address with workspace addresses, ADR-025), or signing out.
    const address = await currentAddress();
    const others = me.memberships.filter((item) => item.workspace.id !== membership.workspace.id);
    return (
      <ToastProvider>
        <CenteredPage width="md">
          <FormCard
            title="Tạo site khách hàng"
            description={`Chỉ ${holdersOf('sites.manage')} của workspace ${workspaceName} được tạo site mới. Hãy nhờ họ tạo site, bạn sẽ thấy site đó ở đây sau khi được tạo.`}
          >
            <div className={styles.actions}>
              {backHref === null ? null : (
                <ButtonLink as={Link} href={backHref} variant="secondary">
                  Quay lại danh sách trang
                </ButtonLink>
              )}
              {address.kind === 'single' ? (
                <OtherWorkspaces memberships={others} />
              ) : others.length === 0 ? null : (
                // The common address lists them; with no other, it would only come back here.
                <ButtonLink href={`${address.addresses.commonOrigin}/`} variant="secondary">
                  Xem tất cả workspace
                </ButtonLink>
              )}
              {backHref === null ? <SignOutButton variant="ghost" /> : null}
            </div>
          </FormCard>
        </CenteredPage>
      </ToastProvider>
    );
  }

  const env = parseAdminEnv(process.env);
  return (
    <CenteredPage width="md">
      <FormCard
        title="Tạo site khách hàng"
        description={`Mỗi site có địa chỉ mặc định và bộ trang riêng của một khách hàng. Site mới thuộc workspace ${workspaceName}.`}
      >
        <CreateSiteForm
          workspaceId={membership.workspace.id}
          originTemplate={env.PUBLIC_SITE_ORIGIN_TEMPLATE}
          cancelHref={backHref}
        />
      </FormCard>
    </CenteredPage>
  );
}
