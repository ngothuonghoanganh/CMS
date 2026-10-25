import type { Metadata } from 'next';
import { AnalyticsScreen } from '../../../../../features/analytics/AnalyticsScreen';
import { parseAnalyticsFilters } from '../../../../../features/analytics/filters';
import { loadAnalyticsData } from '../../../../../features/analytics/load-analytics';
import { loadSiteContext } from '../../../../../features/shell/site-context';

interface AnalyticsPageProps {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: AnalyticsPageProps): Promise<Metadata> {
  const { site } = await loadSiteContext((await params).siteId);
  return { title: `Hiệu quả — ${site.name}` };
}

/** Screen 11: "Hiệu quả". The client keeps the range and the page in the URL. */
export default async function AnalyticsPage({ params, searchParams }: AnalyticsPageProps) {
  const { site } = await loadSiteContext((await params).siteId);
  const filters = parseAnalyticsFilters(await searchParams);
  const data = await loadAnalyticsData(site.id, filters);
  return (
    // Each server render (a sidebar link, a refresh) starts again from the URL.
    <AnalyticsScreen
      key={data.loadedAt}
      site={site}
      pageRefs={data.pageRefs.items}
      initialFilters={filters}
      initialReport={data.report}
      loadedAt={data.loadedAt}
    />
  );
}
