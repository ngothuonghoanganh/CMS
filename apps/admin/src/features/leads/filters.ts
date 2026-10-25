import {
  DEFAULT_LEAD_RANGE,
  idSchema,
  LEAD_SEARCH_MAX,
  type LeadFolder,
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
 * &from=&to=&q=`), with the selected lead (`&lead=`), so a reload or a shared link keeps them.
 */
export interface LeadInboxFilters {
  folder: LeadFolder;
  pageId: string | null;
  status: LeadStatus | null;
  range: LeadRange;
  /** First and last day of a custom range ("2026-10-01"); empty until chosen. */
  from: string;
  to: string;
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

export function normalizeLeadSearch(value: string): string {
  return value.trim().slice(0, LEAD_SEARCH_MAX);
}

/** Reads the filters from search params, ignoring anything the API would reject. */
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
    q: normalizeLeadSearch(single(params.q)),
  };
}

/** The lead shown in the detail panel, from `?lead=`. */
export function parseSelectedLead(
  params: Partial<Record<string, SearchParamValue>>,
): string | null {
  return parsed(idSchema, single(params.lead));
}

/** "?status=new&range=all&lead=…", without the defaults; "" when nothing differs. */
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
  if (filters.q !== '') {
    params.set('q', filters.q);
  }
  if (leadId !== null) {
    params.set('lead', leadId);
  }
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}

/** The API filters for the inbox filters; empty values are left out. */
export type LeadFilterQuery = Omit<LeadListQuery, 'cursor' | 'limit'>;

export type LeadFilterCheck =
  | { ok: true; query: LeadFilterQuery }
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
    ...(filters.q === '' ? {} : { q: filters.q }),
  };
  const result = leadFiltersSchema.safeParse(query);
  if (!result.success) {
    return { ok: false, message: result.error.issues[0]?.message ?? 'Bộ lọc chưa hợp lệ' };
  }
  return { ok: true, query };
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
