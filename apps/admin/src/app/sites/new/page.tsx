import { endpoints, type Membership } from '@plp/contracts';
import { ButtonLink } from '@plp/ui';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { parseAdminEnv } from '../../../env';
import { CenteredPage } from '../../../features/shell/CenteredPage';
import { FormCard } from '../../../features/shell/FormCard';
import { siteHref } from '../../../features/shell/navigation';
import {
  pickMembership,
  WORKSPACE_PREFERENCE_COOKIE,
} from '../../../features/shell/workspace-preference';
import { CreateSiteForm } from '../../../features/sites/CreateSiteForm';
import { requireMe, serverApi } from '../../../lib/server-api';

export const metadata: Metadata = { title: 'Tạo site khách hàng' };

/** `?workspace=` (from the sidebar) wins over the remembered workspace when the user is a member. */
async function chooseMembership(
  memberships: readonly Membership[],
  requested: string | string[] | undefined,
): Promise<Membership | null> {
  const fromQuery = memberships.find((item) => item.workspace.id === requested);
  if (fromQuery !== undefined) {
    return fromQuery;
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
      <CenteredPage width="md">
        <FormCard
          title="Tạo site khách hàng"
          description="Tài khoản của bạn chưa thuộc workspace nào, nên chưa thể tạo site."
        >
          {null}
        </FormCard>
      </CenteredPage>
    );
  }

  const { items: sites } = await serverApi(endpoints.listSites, [membership.workspace.id]);
  const firstSite = sites[0];
  const backHref = firstSite === undefined ? null : siteHref(firstSite.id);
  const workspaceName = membership.workspace.name;

  if (membership.role !== 'owner') {
    return (
      <CenteredPage width="md">
        <FormCard
          title="Tạo site khách hàng"
          description={`Chỉ Owner của workspace ${workspaceName} được tạo site mới. Hãy nhờ Owner tạo site, bạn sẽ thấy site đó ở đây sau khi được tạo.`}
        >
          {backHref === null ? null : (
            <ButtonLink as={Link} href={backHref} variant="secondary">
              Quay lại danh sách trang
            </ButtonLink>
          )}
        </FormCard>
      </CenteredPage>
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
