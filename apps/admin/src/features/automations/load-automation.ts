import {
  type AutomationDetail,
  type AutomationRunListResponse,
  endpoints,
  type Site,
} from '@plp/contracts';
import { serverApi } from '../../lib/server-api';

export interface AutomationData {
  automation: AutomationDetail;
  site: Site;
  /** When the data was loaded (epoch ms): its age for the time labels. */
  loadedAt: number;
}

/** Server-side load of screen 26. */
export async function loadAutomationData(
  siteId: string,
  automation: Promise<AutomationDetail>,
): Promise<AutomationData> {
  const [loaded, site] = await Promise.all([automation, serverApi(endpoints.getSite, [siteId])]);
  return { automation: loaded, site, loadedAt: Date.now() };
}

export interface AutomationRunsData extends AutomationData {
  runs: AutomationRunListResponse;
}

/** Server-side load of screen 27: the automation and the first page of its runs. */
export async function loadAutomationRunsData(
  siteId: string,
  automation: Promise<AutomationDetail>,
): Promise<AutomationRunsData> {
  const loaded = await automation;
  const [site, runs] = await Promise.all([
    serverApi(endpoints.getSite, [siteId]),
    serverApi(endpoints.listAutomationRuns, [siteId, loaded.id], { query: { status: 'all' } }),
  ]);
  return { automation: loaded, site, runs, loadedAt: Date.now() };
}
