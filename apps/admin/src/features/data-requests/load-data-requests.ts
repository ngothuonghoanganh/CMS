import { type DataRequestListResponse, endpoints } from '@plp/contracts';
import { serverApi } from '../../lib/server-api';
import { DATA_REQUEST_PAGE_SIZE } from './queries';

export interface DataRequestsData {
  list: DataRequestListResponse;
  /** When the list was loaded (epoch ms): its age for the cache, and "now" for the deadlines. */
  loadedAt: number;
}

/** Server-side load of the first page of the site's data requests (owner only). */
export async function loadDataRequests(siteId: string): Promise<DataRequestsData> {
  const list = await serverApi(endpoints.listDataRequests, [siteId], {
    query: { limit: DATA_REQUEST_PAGE_SIZE },
  });
  return { list, loadedAt: Date.now() };
}
