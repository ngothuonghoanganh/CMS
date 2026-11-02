import { endpoints } from '@plp/contracts';
import type { Metadata } from 'next';
import { serverApi } from '../../../../../lib/server-api';
import { loadWorkspaceContext } from '../../../../../features/shell/workspace-context';
import { tabOf } from '../../../../../features/templates/library-filters';
import { chosenSite, requestedSite } from '../../../../../features/templates/load-templates';
import { TemplateLibrary } from '../../../../../features/templates/TemplateLibrary';
import { WorkspaceTemplatesScreen } from '../../../../../features/templates/WorkspaceTemplatesScreen';

interface TemplatesPageProps {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function sourceOf(query: Record<string, string | string[] | undefined>) {
  const source = query['source'];
  return tabOf(typeof source === 'string' ? source : undefined);
}

export async function generateMetadata({
  params,
  searchParams,
}: TemplatesPageProps): Promise<Metadata> {
  const { membership } = await loadWorkspaceContext((await params).workspaceId);
  const title =
    sourceOf(await searchParams) === 'workspace' ? 'Template của workspace' : 'Templates';
  return { title: `${title} — ${membership.workspace.name}` };
}

/**
 * "Templates" (board 17, ADR-030): the library every member browses. The tab and the site to
 * create for come from the URL (`?source=`, `?site=`); the search and filters stay on the screen.
 * The tab "Của workspace" is board 19, the workspace's own templates (`&archived=1` for "Lưu trữ").
 */
export default async function TemplatesPage({ params, searchParams }: TemplatesPageProps) {
  const { workspaceId } = await params;
  const query = await searchParams;
  const { membership, sites, site } = await loadWorkspaceContext(workspaceId);
  const tab = sourceOf(query);
  const initialSiteId = chosenSite(sites, requestedSite(query['site']), site)?.id ?? null;
  if (tab === 'workspace') {
    const { items } = await serverApi(endpoints.listWorkspaceTemplates, [workspaceId]);
    return (
      <WorkspaceTemplatesScreen
        workspace={membership.workspace}
        role={membership.role}
        templates={items}
        sites={sites}
        initialSiteId={initialSiteId}
        archived={query['archived'] === '1'}
      />
    );
  }
  const { items } = await serverApi(endpoints.listTemplates, [workspaceId]);
  return (
    <TemplateLibrary
      workspace={membership.workspace}
      role={membership.role}
      templates={items}
      sites={sites}
      initialSiteId={initialSiteId}
      tab={tab}
    />
  );
}
