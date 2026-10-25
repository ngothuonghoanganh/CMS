import {
  cleanLeadSearch,
  DEFAULT_LEAD_RANGE,
  idSchema,
  type LeadFolder,
  type LeadFiltersRequest,
  leadFiltersSchema,
  leadFolderSchema,
  type LeadListQuery,
  type LeadRange,
  leadRangeSchema,
  type LeadStatus,
  leadStatusSchema,
  vnDaySchema,
} from '@plp/contracts';
import type { z } from 'zod';

/**
 * Filters of the lead inbox (board 10). They live in the URL (`?folder=&pageId=&status=&range=
 * &from=&to=`), with the selected lead (`&lead=`), so a reload or a shared link keeps them. The
 * search does not: a phone number, email or name in a URL would reach browser history, access logs
 * and the Referer header (rule 10).
 */
export interface LeadInboxFilters {
  folder: LeadFolder;
  pageId: string | null;
  status: LeadStatus | null;
  range: LeadRange;
  /** First and last day of a custom range ("2026-10-01"); empty until chosen. */
  from: string;
  to: string;
  /** What the member typed in "Tìm lead", cleaned; sent in request bodies only. */
  q: string;
}

/** Leads per request (the API maximum); more load with "Tải thêm". */
export const LEAD_PAGE_SIZE = 50;

export const DEFAULT_LEAD_FILTERS: LeadInboxFilters = {
  folder: 'inbox',
  pageId: null,
  status: null,
  range: DEFAULT_LEAD_RANGE,
  from: '',
  to: '',
  q: '',
};

export type SearchParamValue = string | readonly string[] | null | undefined;

function single(value: SearchParamValue): string {
  return typeof value === 'string' ? value : '';
}

function parsed<T>(schema: z.ZodType<T>, value: string): T | null {
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}

/** A typed or pasted search as the API accepts it. */
export function normalizeLeadSearch(value: string): string {
  return cleanLeadSearch(value);
}

/** Reads the filters from search params, ignoring anything the API would reject and any search. */
export function parseLeadFilters(
  params: Partial<Record<string, SearchParamValue>>,
): LeadInboxFilters {
  const range = parsed(leadRangeSchema, single(params.range)) ?? DEFAULT_LEAD_RANGE;
  return {
    folder: parsed(leadFolderSchema, single(params.folder)) ?? 'inbox',
    pageId: parsed(idSchema, single(params.pageId)),
    status: parsed(leadStatusSchema, single(params.status)),
    range,
    from: range === 'custom' ? (parsed(vnDaySchema, single(params.from)) ?? '') : '',
    to: range === 'custom' ? (parsed(vnDaySchema, single(params.to)) ?? '') : '',
    q: '',
  };
}

/** `?recipients=open`: "Nơi nhận lead" opens with the page. */
export function parseRecipientsOpen(params: Partial<Record<string, SearchParamValue>>): boolean {
  return single(params.recipients) === 'open';
}

/** The lead shown in the detail panel, from `?lead=`. */
export function parseSelectedLead(
  params: Partial<Record<string, SearchParamValue>>,
): string | null {
  return parsed(idSchema, single(params.lead));
}

/** "?status=new&range=all&lead=…", without the defaults or the search; "" when nothing differs. */
export function leadInboxSearch(filters: LeadInboxFilters, leadId: string | null): string {
  const params = new URLSearchParams();
  if (filters.folder !== 'inbox') {
    params.set('folder', filters.folder);
  }
  if (filters.pageId !== null) {
    params.set('pageId', filters.pageId);
  }
  if (filters.status !== null) {
    params.set('status', filters.status);
  }
  if (filters.range !== DEFAULT_LEAD_RANGE) {
    params.set('range', filters.range);
  }
  if (filters.range === 'custom') {
    if (filters.from !== '') {
      params.set('from', filters.from);
    }
    if (filters.to !== '') {
      params.set('to', filters.to);
    }
  }
  if (leadId !== null) {
    params.set('lead', leadId);
  }
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}

/** The API filters for the inbox filters, without the search; empty values are left out. */
export type LeadFilterQuery = Omit<LeadListQuery, 'cursor' | 'limit'>;

export type LeadFilterCheck =
  /** `q` is "" without a search; with one, the list and the export send it in a request body. */
  | { ok: true; query: LeadFilterQuery; q: string }
  /** A custom range still missing a day, or spanning too many days: nothing to ask the API yet. */
  | { ok: false; message: string };

export function leadFilterQuery(filters: LeadInboxFilters): LeadFilterCheck {
  const query: LeadFilterQuery = {
    folder: filters.folder,
    range: filters.range,
    ...(filters.pageId === null ? {} : { pageId: filters.pageId }),
    ...(filters.status === null ? {} : { status: filters.status }),
    ...(filters.range === 'custom' && filters.from !== '' ? { from: filters.from } : {}),
    ...(filters.range === 'custom' && filters.to !== '' ? { to: filters.to } : {}),
  };
  const result = leadFiltersSchema.safeParse({
    ...query,
    ...(filters.q === '' ? {} : { q: filters.q }),
  });
  if (!result.success) {
    return { ok: false, message: result.error.issues[0]?.message ?? 'Bộ lọc chưa hợp lệ' };
  }
  return { ok: true, query, q: filters.q };
}

/** The body of the CSV export: the filters and, if any, the search. */
export function leadExportBody(check: { query: LeadFilterQuery; q: string }): LeadFiltersRequest {
  return { ...check.query, ...(check.q === '' ? {} : { q: check.q }) };
}

/** Whether the inbox shows something other than its default view, e.g. for "Xem tất cả lead". */
export function isFiltered(filters: LeadInboxFilters): boolean {
  return (
    filters.pageId !== null ||
    filters.status !== null ||
    filters.range !== DEFAULT_LEAD_RANGE ||
    filters.q !== ''
  );
}
