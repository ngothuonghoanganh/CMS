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
  const { site, membership, leadCounts } = await loadSiteContext(siteId);
  const filters = parseDashboardFilters(await searchParams);
  const data = await loadDashboardData(site.id, filters);
  return (
    // The router keeps the page mounted when only the site in the path changes: another site
    // starts the screen over. A server render of the same site reaches the mounted screen, which
    // keeps its state through a refresh (the sidebar's "Trang N" after "Xóa trang").
    <Dashboard
      key={site.id}
      site={site}
      workspaceName={membership.workspace.name}
      initialFilters={filters}
      initialPages={data.pages}
      initialActivity={data.activity}
      address={data.address}
      initialLeadCounts={leadCounts}
      loadedAt={data.loadedAt}
      role={membership.role}
    />
  );
}
