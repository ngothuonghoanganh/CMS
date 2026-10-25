import {
  type AnalyticsQuery,
  type AnalyticsRange,
  analyticsRangeSchema,
  DEFAULT_ANALYTICS_RANGE,
  idSchema,
} from '@plp/contracts';

/** What "Hiệu quả" shows; it lives in the URL (`?range=30d&pageId=…`) so a reload keeps it. */
export interface AnalyticsFilters {
  range: AnalyticsRange;
  /** Null for "Tất cả trang". */
  pageId: string | null;
}

type SearchParamValue = string | readonly string[] | null | undefined;

function single(value: SearchParamValue): string {
  return typeof value === 'string' ? value : '';
}

/** Reads the filters from search params, ignoring anything the API would refuse. */
export function parseAnalyticsFilters(params: {
  range?: SearchParamValue;
  pageId?: SearchParamValue;
}): AnalyticsFilters {
  const range = analyticsRangeSchema.safeParse(single(params.range));
  const pageId = idSchema.safeParse(single(params.pageId));
  return {
    range: range.success ? range.data : DEFAULT_ANALYTICS_RANGE,
    pageId: pageId.success ? pageId.data : null,
  };
}

/** "?range=30d&pageId=…", or "" for the default 7 days of the whole site. */
export function analyticsSearch(filters: AnalyticsFilters): string {
  const params = new URLSearchParams();
  if (filters.range !== DEFAULT_ANALYTICS_RANGE) {
    params.set('range', filters.range);
  }
  if (filters.pageId !== null) {
    params.set('pageId', filters.pageId);
  }
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}

export function analyticsQuery(filters: AnalyticsFilters): AnalyticsQuery {
  return {
    range: filters.range,
    ...(filters.pageId === null ? {} : { pageId: filters.pageId }),
  };
}

export function sameAnalyticsFilters(a: AnalyticsFilters, b: AnalyticsFilters): boolean {
  return a.range === b.range && a.pageId === b.pageId;
}
