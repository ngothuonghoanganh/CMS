import { describe, expect, it } from 'vitest';
import { analyticsQuery, analyticsSearch, parseAnalyticsFilters } from './filters';

const PAGE_ID = '64b000000000000000000101';

describe('analytics filters', () => {
  it('reads the range and the page from the URL, ignoring what the API would refuse', () => {
    expect(parseAnalyticsFilters({})).toEqual({ range: '7d', pageId: null });
    expect(parseAnalyticsFilters({ range: '90d', pageId: PAGE_ID })).toEqual({
      range: '90d',
      pageId: PAGE_ID,
    });
    expect(parseAnalyticsFilters({ range: '365d', pageId: 'khong-phai-id' })).toEqual({
      range: '7d',
      pageId: null,
    });
    expect(parseAnalyticsFilters({ range: ['30d', '90d'] })).toEqual({ range: '7d', pageId: null });
  });

  it('writes only what differs from the default view', () => {
    expect(analyticsSearch({ range: '7d', pageId: null })).toBe('');
    expect(analyticsSearch({ range: '30d', pageId: PAGE_ID })).toBe(`?range=30d&pageId=${PAGE_ID}`);
    expect(analyticsQuery({ range: '7d', pageId: null })).toEqual({ range: '7d' });
    expect(analyticsQuery({ range: '30d', pageId: PAGE_ID })).toEqual({
      range: '30d',
      pageId: PAGE_ID,
    });
  });
});
