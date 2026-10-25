import { type PageCounts, type PageStatusKind, pageStatusKindSchema } from '@plp/contracts';

/** Filters of the page list; they live in the URL (`?status=&q=`) so a reload keeps them. */
export interface DashboardFilters {
  status: PageStatusKind | null;
  q: string;
}

/** Same bound as `pageListQuerySchema.q`. */
export const SEARCH_MAX_LENGTH = 80;

export type SearchParamValue = string | readonly string[] | null | undefined;

function single(value: SearchParamValue): string {
  return typeof value === 'string' ? value : '';
}

/** Reads the filters from search params, ignoring anything the API would reject. */
export function parseDashboardFilters(params: {
  status?: SearchParamValue;
  q?: SearchParamValue;
}): DashboardFilters {
  const status = pageStatusKindSchema.safeParse(single(params.status));
  return {
    status: status.success ? status.data : null,
    q: normalizeSearch(single(params.q)),
  };
}

export function normalizeSearch(value: string): string {
  return value.trim().slice(0, SEARCH_MAX_LENGTH);
}

/** "?status=live&q=uu+dai", or "" without filters. */
export function dashboardSearch(filters: DashboardFilters): string {
  const params = new URLSearchParams();
  if (filters.status !== null) {
    params.set('status', filters.status);
  }
  if (filters.q !== '') {
    params.set('q', filters.q);
  }
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}

/** The API query for the filters; empty values are left out. */
export function pageListQuery(filters: DashboardFilters): { status?: PageStatusKind; q?: string } {
  return {
    ...(filters.status === null ? {} : { status: filters.status }),
    ...(filters.q === '' ? {} : { q: filters.q }),
  };
}

export type StatusFilterValue = 'all' | PageStatusKind;

const statusFilterLabels: Record<StatusFilterValue, string> = {
  all: 'Tất cả',
  live: 'Live',
  live_with_changes: 'Có thay đổi',
  draft: 'Bản nháp',
  unpublished: 'Đã gỡ',
};

const statusFilterOrder: readonly StatusFilterValue[] = [
  'all',
  'live',
  'live_with_changes',
  'draft',
  'unpublished',
];

/** The filter chips with their counts: "Tất cả · 6", "Live · 3", … */
export function statusFilterOptions(
  counts: PageCounts,
): Array<{ value: StatusFilterValue; label: string }> {
  return statusFilterOrder.map((value) => ({
    value,
    label: `${statusFilterLabels[value]} · ${counts[value]}`,
  }));
}
