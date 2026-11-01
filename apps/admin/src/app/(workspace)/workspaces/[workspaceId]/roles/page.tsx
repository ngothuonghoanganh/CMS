import { can, endpoints, holdersOf } from '@plp/contracts';
import type { Metadata } from 'next';
import { RolesScreen } from '../../../../../features/roles/RolesScreen';
import { siteHref } from '../../../../../features/shell/navigation';
import { NoPermission } from '../../../../../features/shell/NoPermission';
import { loadWorkspaceContext } from '../../../../../features/shell/workspace-context';
import { serverApi } from '../../../../../lib/server-api';

interface RolesPageProps {
  params: Promise<{ workspaceId: string }>;
}

export async function generateMetadata({ params }: RolesPageProps): Promise<Metadata> {
  const { membership } = await loadWorkspaceContext((await params).workspaceId);
  return { title: `Vai trò & quyền — ${membership.workspace.name}` };
}

/** Board 16: what each of the six roles may do, and how many members hold each. */
export default async function RolesPage({ params }: RolesPageProps) {
  const { workspaceId } = await params;
  const { membership, site } = await loadWorkspaceContext(workspaceId);
  if (!can(membership.role, 'members.manage')) {
    return (
      <NoPermission
        title="Bạn chưa có quyền xem vai trò & quyền"
        membership={membership}
        holders={`Chỉ ${holdersOf('members.manage')} xem và đổi được phân quyền của workspace.`}
        back={
          site === null
            ? { href: '/', label: 'Về trang chủ' }
            : { href: siteHref(site.id), label: 'Về danh sách trang' }
        }
      />
    );
  }
  const { counts } = await serverApi(endpoints.roleCounts, [workspaceId]);
  return <RolesScreen workspaceName={membership.workspace.name} counts={counts} />;
}
