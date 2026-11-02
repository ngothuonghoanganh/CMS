import { endpoints } from '@plp/contracts';
import type { Metadata } from 'next';
import { serverApi } from '../../../../../lib/server-api';
import { loadWorkspaceContext } from '../../../../../features/shell/workspace-context';
import { tabOf } from '../../../../../features/templates/library-filters';
import { chosenSite, requestedSite } from '../../../../../features/templates/load-templates';
import { TemplateLibrary } from '../../../../../features/templates/TemplateLibrary';

interface TemplatesPageProps {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: TemplatesPageProps): Promise<Metadata> {
  const { membership } = await loadWorkspaceContext((await params).workspaceId);
  return { title: `Templates — ${membership.workspace.name}` };
}

/**
 * "Templates" (board 17, ADR-030): the library every member browses. The tab and the site to
 * create for come from the URL (`?source=`, `?site=`); the search and filters stay on the screen.
 */
export default async function TemplatesPage({ params, searchParams }: TemplatesPageProps) {
  const { workspaceId } = await params;
  const query = await searchParams;
  const { membership, sites, site } = await loadWorkspaceContext(workspaceId);
  const { items } = await serverApi(endpoints.listTemplates, [workspaceId]);
  const source = query['source'];
  return (
    <TemplateLibrary
      workspace={membership.workspace}
      role={membership.role}
      templates={items}
      sites={sites}
      initialSiteId={chosenSite(sites, requestedSite(query['site']), site)?.id ?? null}
      tab={tabOf(typeof source === 'string' ? source : undefined)}
    />
  );
}
