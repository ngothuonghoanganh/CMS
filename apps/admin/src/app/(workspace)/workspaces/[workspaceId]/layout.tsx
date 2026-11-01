import type { ReactNode } from 'react';
import { AppShell } from '../../../../features/shell/AppShell';
import { loadWorkspaceContext } from '../../../../features/shell/workspace-context';

/**
 * The frame of a workspace screen (Sidebar v2): the same sidebar as a site's screens, with the
 * site the user opened last.
 */
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const { me, membership, site, sites, pageCount, leadCounts } =
    await loadWorkspaceContext(workspaceId);
  return (
    <AppShell
      user={me.user}
      memberships={me.memberships}
      membership={membership}
      site={site}
      sites={sites}
      pageCount={pageCount}
      leadCounts={leadCounts}
    >
      {children}
    </AppShell>
  );
}
