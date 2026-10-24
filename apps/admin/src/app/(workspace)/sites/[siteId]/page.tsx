import type { Metadata } from 'next';
import { Dashboard } from '../../../../features/dashboard/Dashboard';
import { parseDashboardFilters } from '../../../../features/dashboard/filters';
import { loadDashboardData } from '../../../../features/dashboard/load-dashboard';
import { loadSiteContext } from '../../../../features/shell/site-context';

interface DashboardPageProps {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: DashboardPageProps): Promise<Metadata> {
  const { site } = await loadSiteContext((await params).siteId);
  return { title: `Trang — ${site.name}` };
}

/** Screen 01: the site's pages. The client keeps the filters in sync with `?status=&q=`. */
export default async function DashboardPage({ params, searchParams }: DashboardPageProps) {
  const { siteId } = await params;
  const { site, membership } = await loadSiteContext(siteId);
  const filters = parseDashboardFilters(await searchParams);
  const data = await loadDashboardData(site.id, filters);
  return (
    // Each server render (a navigation such as the sidebar's "Trang", or a refresh) starts again
    // from the filters in the URL; filtering in the browser only replaces the URL.
    <Dashboard
      key={data.loadedAt}
      site={site}
      workspaceName={membership.workspace.name}
      initialFilters={filters}
      initialPages={data.pages}
      initialActivity={data.activity}
      loadedAt={data.loadedAt}
    />
  );
}
