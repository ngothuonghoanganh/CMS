import { type AutomationDetail, endpoints, type Site } from '@plp/contracts';
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
