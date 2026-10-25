import { type AnalyticsReport, endpoints, type PageRefListResponse } from '@plp/contracts';
import { serverApi } from '../../lib/server-api';
import { analyticsQuery, type AnalyticsFilters } from './filters';

export interface AnalyticsData {
  report: AnalyticsReport;
  pageRefs: PageRefListResponse;
  /** When the data was loaded (epoch ms): its age for the query cache. */
  loadedAt: number;
}

/** Server-side load of "Hiệu quả" for the filters in the URL, with the site's pages to filter by. */
export async function loadAnalyticsData(
  siteId: string,
  filters: AnalyticsFilters,
): Promise<AnalyticsData> {
  const [report, pageRefs] = await Promise.all([
    serverApi(endpoints.analyticsReport, [siteId], { query: analyticsQuery(filters) }),
    serverApi(endpoints.listPageRefs, [siteId]),
  ]);
  return { report, pageRefs, loadedAt: Date.now() };
}
