import { can } from '@plp/contracts';
import { redirect } from 'next/navigation';
import { membersHref } from '../../../../features/shell/navigation';
import { loadWorkspaceContext } from '../../../../features/shell/workspace-context';

interface WorkspacePageProps {
  params: Promise<{ workspaceId: string }>;
}

/**
 * The workspace itself has no screen. Signing in again from one of its screens comes back here
 * (`requireMe`): "Thành viên" for the roles that see it, the start page for the others.
 */
export default async function WorkspacePage({ params }: WorkspacePageProps) {
  const { workspaceId } = await params;
  const { membership } = await loadWorkspaceContext(workspaceId);
  redirect(can(membership.role, 'members.manage') ? membersHref(workspaceId) : '/');
}
