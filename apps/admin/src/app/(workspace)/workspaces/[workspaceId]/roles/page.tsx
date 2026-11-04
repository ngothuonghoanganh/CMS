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

/** Members per role and the custom roles, and when they were read. */
async function loadRoles(workspaceId: string) {
  const [{ counts }, { items }] = await Promise.all([
    serverApi(endpoints.roleCounts, [workspaceId]),
    serverApi(endpoints.listCustomRoles, [workspaceId]),
  ]);
  return { counts, customRoles: items, loadedAt: Date.now() };
}

/** Board 16: what each role may do, how many members hold each, and the custom roles (ADR-024). */
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
        requestAccess
      />
    );
  }
  const { counts, customRoles, loadedAt } = await loadRoles(workspaceId);
  return (
    <RolesScreen
      workspaceId={workspaceId}
      counts={counts}
      initialCustomRoles={customRoles}
      loadedAt={loadedAt}
    />
  );
}
