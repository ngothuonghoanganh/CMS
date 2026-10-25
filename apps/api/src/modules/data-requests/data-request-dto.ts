import type {
  CappedCount,
  DataRequest,
  DataRequestDetail,
  DataRequestMatch,
  UserRef,
} from '@plp/contracts';
import { pageTitleOf } from '../leads/lead-dto.js';
import type { LeadRecord } from '../leads/lead.schema.js';
import type { LeadPerson } from '../leads/leads.repository.js';
import type { DataRequestRecord } from './data-request.schema.js';
import type { DataRequestListRow } from './data-requests.repository.js';

export const DATA_REQUEST_NOT_FOUND = 'Không tìm thấy yêu cầu';

/** Whose leads the request covers; null once a deletion dropped the keys. */
export function personOfRequest(request: Pick<DataRequestRecord, 'search'>): LeadPerson | null {
  return request.search === null
    ? null
    : { leadId: null, phone: request.search.phone, email: request.search.email };
}

export function toDataRequest(row: DataRequestListRow, leads: CappedCount | null): DataRequest {
  return {
    id: row._id.toHexString(),
    contact: { name: row.contact.name, phone: row.contact.phone, email: row.contact.email },
    masked: row.masked,
    type: row.type,
    status: row.status,
    receivedAt: row.receivedAt.toISOString(),
    respondBy: row.respondBy.toISOString(),
    completeBy: row.completeBy.toISOString(),
    respondedAt: row.respondedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    leads,
    completedCount: row.completedCount,
    createdAt: row.createdAt.toISOString(),
  };
}

function toMatch(lead: LeadRecord, titles: ReadonlyMap<string, string>): DataRequestMatch {
  return {
    id: lead._id.toHexString(),
    name: lead.fields.name,
    phone: lead.fields.phone,
    email: lead.fields.email,
    page: { id: lead.pageId.toHexString(), title: pageTitleOf(titles, lead.pageId) },
    createdAt: lead.createdAt.toISOString(),
    marketing: lead.consent.marketing,
    marketingWithdrawnAt: lead.consent.marketingWithdrawnAt?.toISOString() ?? null,
  };
}

export function toDataRequestDetail(
  record: DataRequestRecord,
  leads: CappedCount | null,
  matches: readonly LeadRecord[],
  titles: ReadonlyMap<string, string>,
  users: ReadonlyMap<string, UserRef>,
): DataRequestDetail {
  return {
    ...toDataRequest(record, leads),
    log: record.log.map((entry) => {
      const actor = users.get(entry.actorId.toHexString());
      if (actor === undefined) {
        throw new Error(`Data request log refers to unknown user ${entry.actorId.toHexString()}`);
      }
      return { at: entry.at.toISOString(), actor, action: entry.action, count: entry.count };
    }),
    matches: matches.map((lead) => toMatch(lead, titles)),
  };
}
