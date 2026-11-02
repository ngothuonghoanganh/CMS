import { redirect } from 'next/navigation';
import { sitesHref } from '../../../../features/shell/navigation';
import { loadWorkspaceContext } from '../../../../features/shell/workspace-context';

interface WorkspacePageProps {
  params: Promise<{ workspaceId: string }>;
}

/**
 * The workspace opens on its Sites screen, for every role (ADR-028). Signing in again from one of
 * its screens comes back here (`requireMe`), and so does deleting a site (ADR-027). The context
 * first checks membership (404 otherwise) and the workspace's address (ADR-025).
 */
export default async function WorkspacePage({ params }: WorkspacePageProps) {
  const { workspaceId } = await params;
  await loadWorkspaceContext(workspaceId);
  redirect(sitesHref(workspaceId));
}
