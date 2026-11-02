import type { Metadata } from 'next';
import { SitesScreen } from '../../../../../features/sites/SitesScreen';
import { loadWorkspaceContext } from '../../../../../features/shell/workspace-context';

interface SitesPageProps {
  params: Promise<{ workspaceId: string }>;
}

export async function generateMetadata({ params }: SitesPageProps): Promise<Metadata> {
  const { membership } = await loadWorkspaceContext((await params).workspaceId);
  return { title: `Sites — ${membership.workspace.name}` };
}

/**
 * "Sites" (ADR-028): the sites the user may open, with their counts. They come with the frame,
 * which loads the same list for the sidebar, so the screen asks the API for nothing more.
 */
export default async function SitesPage({ params }: SitesPageProps) {
  const { workspaceId } = await params;
  const { membership, sites } = await loadWorkspaceContext(workspaceId);
  return (
    <SitesScreen
      workspace={membership.workspace}
      role={membership.role}
      siteIds={membership.siteIds}
      sites={sites}
    />
  );
}
