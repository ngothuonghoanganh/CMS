import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LEAD_FILTERS,
  isFiltered,
  leadFilterQuery,
  leadInboxSearch,
  parseLeadFilters,
  parseSelectedLead,
} from './filters';
import { LEAD_ID, PAGE_ID } from './test-fixtures';

describe('lead inbox filters', () => {
  it('reads the filters and the open lead from the URL', () => {
    expect(
      parseLeadFilters({
        folder: 'spam',
        pageId: PAGE_ID,
        status: 'scheduled',
        range: 'custom',
        from: '2026-10-01',
        to: '2026-10-31',
        q: '  0901 ',
      }),
    ).toEqual({
      folder: 'spam',
      pageId: PAGE_ID,
      status: 'scheduled',
      range: 'custom',
      from: '2026-10-01',
      to: '2026-10-31',
      q: '0901',
    });
    expect(parseSelectedLead({ lead: LEAD_ID })).toBe(LEAD_ID);
  });

  it('falls back to the defaults for values the API would refuse', () => {
    expect(
      parseLeadFilters({
        folder: 'trash',
        pageId: 'abc',
        status: 'lost',
        range: '90d',
        from: '2026-10-01',
        q: ['a', 'b'],
      }),
    ).toEqual(DEFAULT_LEAD_FILTERS);
    expect(parseLeadFilters({ range: 'custom', from: '01/10/2026' })).toMatchObject({
      range: 'custom',
      from: '',
      to: '',
    });
    expect(parseSelectedLead({ lead: 'nope' })).toBeNull();
  });

  it('writes only what differs from the default view into the URL', () => {
    expect(leadInboxSearch(DEFAULT_LEAD_FILTERS, null)).toBe('');
    expect(leadInboxSearch({ ...DEFAULT_LEAD_FILTERS, status: 'new', range: 'all' }, LEAD_ID)).toBe(
      `?status=new&range=all&lead=${LEAD_ID}`,
    );
    expect(
      leadInboxSearch(
        { ...DEFAULT_LEAD_FILTERS, range: 'custom', from: '2026-10-01', to: '', q: 'Hà' },
        null,
      ),
    ).toBe('?range=custom&from=2026-10-01&q=H%C3%A0');
    // Days only belong to a custom range.
    expect(leadInboxSearch({ ...DEFAULT_LEAD_FILTERS, from: '2026-10-01' }, null)).toBe('');
  });

  it('asks the API only once a custom range is complete and within 365 days', () => {
    expect(leadFilterQuery(DEFAULT_LEAD_FILTERS)).toEqual({
      ok: true,
      query: { folder: 'inbox', range: '7d' },
    });
    expect(
      leadFilterQuery({ ...DEFAULT_LEAD_FILTERS, range: 'custom', from: '2026-10-01' }),
    ).toEqual({ ok: false, message: 'Chọn ngày bắt đầu và ngày kết thúc' });
    expect(
      leadFilterQuery({
        ...DEFAULT_LEAD_FILTERS,
        range: 'custom',
        from: '2025-01-01',
        to: '2026-10-01',
      }),
    ).toEqual({ ok: false, message: 'Chọn tối đa 365 ngày' });
    expect(
      leadFilterQuery({
        ...DEFAULT_LEAD_FILTERS,
        folder: 'spam',
        pageId: PAGE_ID,
        range: 'custom',
        from: '2026-10-01',
        to: '2026-10-31',
        q: 'Hà',
      }),
    ).toEqual({
      ok: true,
      query: {
        folder: 'spam',
        pageId: PAGE_ID,
        range: 'custom',
        from: '2026-10-01',
        to: '2026-10-31',
        q: 'Hà',
      },
    });
  });

  it('tells a filtered view from the default one; the folder is not a filter', () => {
    expect(isFiltered(DEFAULT_LEAD_FILTERS)).toBe(false);
    expect(isFiltered({ ...DEFAULT_LEAD_FILTERS, folder: 'spam' })).toBe(false);
    expect(isFiltered({ ...DEFAULT_LEAD_FILTERS, range: 'all' })).toBe(true);
    expect(isFiltered({ ...DEFAULT_LEAD_FILTERS, q: 'Hà' })).toBe(true);
  });
});
