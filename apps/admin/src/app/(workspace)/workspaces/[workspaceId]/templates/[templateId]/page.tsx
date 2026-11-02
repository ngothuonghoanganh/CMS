import type { Metadata } from 'next';
import { loadWorkspaceContext } from '../../../../../../features/shell/workspace-context';
import {
  chosenSite,
  loadTemplateDetail,
  requestedSite,
  requestedVersion,
} from '../../../../../../features/templates/load-templates';
import { TemplateDetailScreen } from '../../../../../../features/templates/TemplateDetailScreen';

interface TemplatePageProps {
  params: Promise<{ workspaceId: string; templateId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function load({ params, searchParams }: TemplatePageProps) {
  const { workspaceId, templateId } = await params;
  const query = await searchParams;
  const context = await loadWorkspaceContext(workspaceId);
  const site = chosenSite(context.sites, requestedSite(query['site']), context.site);
  const template = await loadTemplateDetail(
    workspaceId,
    templateId,
    site?.id ?? null,
    requestedVersion(query['version']),
  );
  return { context, site, template };
}

export async function generateMetadata(props: TemplatePageProps): Promise<Metadata> {
  const { context, template } = await load(props);
  return { title: `${template.name} — Templates — ${context.membership.workspace.name}` };
}

/**
 * One template (board 18, ADR-030), previewed in the theme of the site chosen in the library and
 * with what that site still needs; `?version=` shows an earlier version of a workspace template
 * ("Xem trước vN" of its history), with nothing made from it. An unknown template is a 404.
 */
export default async function TemplatePage(props: TemplatePageProps) {
  const { context, site, template } = await load(props);
  return (
    <TemplateDetailScreen
      workspace={context.membership.workspace}
      role={context.membership.role}
      siteLimited={context.membership.siteIds !== null}
      template={template}
      sites={context.sites}
      siteId={site?.id ?? null}
    />
  );
}
