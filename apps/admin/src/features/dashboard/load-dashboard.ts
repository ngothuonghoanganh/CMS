import { type ActivityListResponse, endpoints, type PageListResponse } from '@plp/contracts';
import { serverApi } from '../../lib/server-api';
import { type DashboardFilters, pageListQuery } from './filters';
import { PAGE_LIST_LIMIT, RECENT_ACTIVITY_QUERY } from './queries';

export interface DashboardData {
  pages: PageListResponse;
  activity: ActivityListResponse;
  /** When the data was loaded (epoch ms): its age for the query cache and "x phút trước". */
  loadedAt: number;
}

/** Server-side load of the dashboard for the filters in the URL. */
export async function loadDashboardData(
  siteId: string,
  filters: DashboardFilters,
): Promise<DashboardData> {
  const [pages, activity] = await Promise.all([
    serverApi(endpoints.listPages, [siteId], {
      query: { ...pageListQuery(filters), limit: PAGE_LIST_LIMIT },
    }),
    serverApi(endpoints.listActivity, [siteId], { query: RECENT_ACTIVITY_QUERY }),
  ]);
  return { pages, activity, loadedAt: Date.now() };
}
