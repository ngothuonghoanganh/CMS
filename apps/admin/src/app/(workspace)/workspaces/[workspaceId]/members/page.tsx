import { can, endpoints, holdersOf, idSchema } from '@plp/contracts';
import type { Metadata } from 'next';
import { MembersScreen } from '../../../../../features/members/MembersScreen';
import { siteHref } from '../../../../../features/shell/navigation';
import { NoPermission } from '../../../../../features/shell/NoPermission';
import { loadWorkspaceContext } from '../../../../../features/shell/workspace-context';
import { serverApi } from '../../../../../lib/server-api';

interface MembersPageProps {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: MembersPageProps): Promise<Metadata> {
  const { membership } = await loadWorkspaceContext((await params).workspaceId);
  return { title: `Thành viên — ${membership.workspace.name}` };
}

/** The three lists of the screen, and when they were read. */
async function loadMembers(workspaceId: string, decides: boolean) {
  const [members, invitations, requests] = await Promise.all([
    serverApi(endpoints.listMembers, [workspaceId]),
    serverApi(endpoints.listInvitations, [workspaceId]),
    decides ? serverApi(endpoints.listAccessRequests, [workspaceId]) : null,
  ]);
  return { members, invitations, requests, loadedAt: Date.now() };
}

/** Board 15: members, pending invitations and, for Chủ sở hữu, access requests (ADR-021). */
export default async function MembersPage({ params, searchParams }: MembersPageProps) {
  const { workspaceId } = await params;
  const { me, membership, site, sites } = await loadWorkspaceContext(workspaceId);
  if (!can(membership.role, 'members.manage')) {
    return (
      <NoPermission
        title="Bạn chưa có quyền xem thành viên"
        membership={membership}
        holders={`Chỉ ${holdersOf('members.manage')} xem và đổi được thành viên của workspace.`}
        back={
          site === null
            ? { href: '/', label: 'Về trang chủ' }
            : { href: siteHref(site.id), label: 'Về danh sách trang' }
        }
        requestAccess
      />
    );
  }
  const { members, invitations, requests, loadedAt } = await loadMembers(
    workspaceId,
    can(membership.role, 'accessRequests.decide'),
  );
  const request = idSchema.safeParse((await searchParams).request);
  return (
    <MembersScreen
      workspace={membership.workspace}
      viewer={{ userId: me.user.id, role: membership.role }}
      sites={sites}
      initialMembers={members}
      initialInvitations={invitations}
      initialRequests={requests}
      openRequestId={request.success ? request.data : null}
      loadedAt={loadedAt}
    />
  );
}
