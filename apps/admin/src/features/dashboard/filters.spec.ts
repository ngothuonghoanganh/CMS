import { describe, expect, it } from 'vitest';
import {
  dashboardSearch,
  pageListQuery,
  parseDashboardFilters,
  statusFilterOptions,
} from './filters';

describe('parseDashboardFilters', () => {
  it('reads a known status and a trimmed search', () => {
    expect(parseDashboardFilters({ status: 'live_with_changes', q: '  uu dai ' })).toEqual({
      status: 'live_with_changes',
      q: 'uu dai',
    });
  });

  it('ignores unknown statuses, repeated params and over-long searches', () => {
    expect(parseDashboardFilters({ status: 'archived', q: ['a', 'b'] })).toEqual({
      status: null,
      q: '',
    });
    expect(parseDashboardFilters({ q: 'x'.repeat(100) }).q).toHaveLength(80);
    expect(parseDashboardFilters({})).toEqual({ status: null, q: '' });
  });
});

describe('dashboardSearch and pageListQuery', () => {
  it('serialise only the filters that are set', () => {
    expect(dashboardSearch({ status: null, q: '' })).toBe('');
    expect(dashboardSearch({ status: 'draft', q: 'uu dai' })).toBe('?status=draft&q=uu+dai');
    expect(pageListQuery({ status: null, q: '' })).toEqual({});
    expect(pageListQuery({ status: 'live', q: 'implant' })).toEqual({
      status: 'live',
      q: 'implant',
    });
  });
});

describe('statusFilterOptions', () => {
  it('labels each chip with its count, in the board order', () => {
    expect(
      statusFilterOptions({ all: 6, live: 3, live_with_changes: 1, draft: 2, unpublished: 1 }).map(
        (option) => option.label,
      ),
    ).toEqual(['Tất cả · 6', 'Live · 3', 'Có thay đổi · 1', 'Bản nháp · 2', 'Đã gỡ · 1']);
  });
});
