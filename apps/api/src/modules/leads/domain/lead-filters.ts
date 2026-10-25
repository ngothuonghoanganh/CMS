import {
  type InstantWindow,
  type LeadFilters,
  type LeadStatus,
  recentDaysWindow,
  vnDaysWindow,
} from '@plp/contracts';
import { type ObjectId, toObjectId } from '../../../shared/persistence/object-id.js';
import { type LeadQuery, parseLeadQuery } from './lead-search.js';

/** The inbox filters (board 10) in the terms the repository queries by. */
export interface LeadCriteria {
  /** "Nghi ngờ spam" (true) or "Hộp thư" (false). */
  spam: boolean;
  pageId: ObjectId | null;
  status: LeadStatus | null;
  /** Leads created in `[from, to)`; null for every lead. */
  createdIn: InstantWindow | null;
  search: LeadQuery | null;
}

/** The days a range covers, in Vietnam; null for "Toàn bộ thời gian". */
export function leadRangeWindow(
  filters: Pick<LeadFilters, 'range' | 'from' | 'to'>,
  now: Date,
): InstantWindow | null {
  switch (filters.range) {
    case '7d':
      return recentDaysWindow(now, 7);
    case '30d':
      return recentDaysWindow(now, 30);
    case 'all':
      return null;
    case 'custom':
      if (filters.from === undefined || filters.to === undefined) {
        throw new Error('A custom lead range without its days passed validation');
      }
      return vnDaysWindow(filters.from, filters.to);
  }
}

export function leadCriteria(filters: LeadFilters, now: Date): LeadCriteria {
  return {
    spam: filters.folder === 'spam',
    pageId: filters.pageId === undefined ? null : toObjectId(filters.pageId),
    status: filters.status ?? null,
    createdIn: leadRangeWindow(filters, now),
    search: filters.q === undefined ? null : parseLeadQuery(filters.q),
  };
}
