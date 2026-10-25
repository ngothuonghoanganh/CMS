import { describe, expect, it } from 'vitest';
import { leadCriteria, leadRangeWindow } from './lead-filters.js';

// 16:42 on 24 October 2026 in Vietnam.
const NOW = new Date('2026-10-24T09:42:00.000Z');

describe('leadRangeWindow', () => {
  it('covers today and the days before it, in Vietnam', () => {
    expect(leadRangeWindow({ range: '7d' }, NOW)).toEqual({
      from: new Date('2026-10-17T17:00:00.000Z'),
      to: new Date('2026-10-24T17:00:00.000Z'),
    });
    expect(leadRangeWindow({ range: '30d' }, NOW)?.from).toEqual(
      new Date('2026-09-24T17:00:00.000Z'),
    );
  });

  it('has no bounds for every lead, and whole chosen days for a custom range', () => {
    expect(leadRangeWindow({ range: 'all' }, NOW)).toBeNull();
    expect(leadRangeWindow({ range: 'custom', from: '2026-10-01', to: '2026-10-01' }, NOW)).toEqual(
      {
        from: new Date('2026-09-30T17:00:00.000Z'),
        to: new Date('2026-10-01T17:00:00.000Z'),
      },
    );
  });

  it('fails loudly for a custom range that skipped validation', () => {
    expect(() => leadRangeWindow({ range: 'custom', from: '2026-10-01' }, NOW)).toThrow(
      /without its days/,
    );
  });
});

describe('leadCriteria', () => {
  it('turns the filters of board 10 into criteria', () => {
    const criteria = leadCriteria(
      {
        folder: 'spam',
        pageId: '64b0000000000000000000a1',
        status: 'new',
        range: 'all',
        q: '0901',
      },
      NOW,
    );
    expect(criteria).toMatchObject({
      spam: true,
      status: 'new',
      createdIn: null,
      search: { kind: 'phone', prefixes: ['84901'] },
    });
    expect(criteria.pageId?.toHexString()).toBe('64b0000000000000000000a1');
  });

  it('leaves out the filters that are not set', () => {
    expect(leadCriteria({ folder: 'inbox', range: 'all' }, NOW)).toEqual({
      spam: false,
      pageId: null,
      status: null,
      createdIn: null,
      search: null,
    });
  });
});
