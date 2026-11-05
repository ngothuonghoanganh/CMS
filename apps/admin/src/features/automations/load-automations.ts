import { type AutomationListResponse, endpoints } from '@plp/contracts';
import { serverApi } from '../../lib/server-api';

export interface AutomationsData {
  list: AutomationListResponse;
  /** When the data was loaded (epoch ms): its age for the query cache and the time labels. */
  loadedAt: number;
}

/** Server-side load of screen 25. */
export async function loadAutomationsData(siteId: string): Promise<AutomationsData> {
  const list = await serverApi(endpoints.listAutomations, [siteId]);
  return { list, loadedAt: Date.now() };
}
