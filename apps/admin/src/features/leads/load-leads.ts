import {
  endpoints,
  type LeadDetail,
  type LeadListResponse,
  type PageRefListResponse,
} from '@plp/contracts';
import { ApiError } from '../../lib/api-core';
import { serverApi } from '../../lib/server-api';
import { LEAD_PAGE_SIZE, leadFilterQuery, type LeadInboxFilters } from './filters';

export interface LeadInboxData {
  /** Null when the URL held a custom range the API would refuse. */
  list: LeadListResponse | null;
  pageRefs: PageRefListResponse;
  /** The lead of `?lead=`; null without one, or when it no longer exists. */
  detail: LeadDetail | null;
  /** When the data was loaded (epoch ms): its age for the query cache and the time labels. */
  loadedAt: number;
}

/** A lead from the URL; one deleted since the link was made shows as gone in the panel. */
async function loadLead(leadId: string): Promise<LeadDetail | null> {
  try {
    return await serverApi(endpoints.getLead, [leadId]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

/** Server-side load of the lead inbox for the filters and the lead in the URL. */
export async function loadLeadInboxData(
  siteId: string,
  filters: LeadInboxFilters,
  leadId: string | null,
): Promise<LeadInboxData> {
  const check = leadFilterQuery(filters);
  const [list, pageRefs, detail] = await Promise.all([
    check.ok
      ? serverApi(endpoints.listLeads, [siteId], {
          query: { ...check.query, limit: LEAD_PAGE_SIZE },
        })
      : null,
    serverApi(endpoints.listPageRefs, [siteId]),
    leadId === null ? null : loadLead(leadId),
  ]);
  return { list, pageRefs, detail, loadedAt: Date.now() };
}
