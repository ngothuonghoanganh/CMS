import { type AutomationListResponse, endpoints } from '@plp/contracts';
import { serverApi } from '../../lib/server-api';

export interface AutomationsData {
  /** Null when the plan has no automation: there is no list to read (ADR-035). */
  list: AutomationListResponse | null;
  /** When the data was loaded (epoch ms): its age for the query cache and the time labels. */
  loadedAt: number;
}

/** Server-side load of screen 25. */
export async function loadAutomationsData(
  siteId: string,
  planHasAutomation: boolean,
): Promise<AutomationsData> {
  const list = planHasAutomation ? await serverApi(endpoints.listAutomations, [siteId]) : null;
  return { list, loadedAt: Date.now() };
}
