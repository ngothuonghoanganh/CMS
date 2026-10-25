import { describe, expect, it } from 'vitest';
import {
  cleanLeadSearch,
  leadFiltersSchema,
  leadListQuerySchema,
  leadSearchRequestSchema,
  leadSourceLabel,
  updateLeadRequestSchema,
} from './lead-inbox.js';

describe('leadListQuerySchema', () => {
  it('lists the inbox of the last 7 days, 50 at a time, by default', () => {
    expect(leadListQuerySchema.parse({})).toEqual({ folder: 'inbox', range: '7d', limit: 50 });
  });

  it('accepts every filter of board 10', () => {
    expect(
      leadListQuerySchema.parse({
        folder: 'spam',
        pageId: '64b0000000000000000000a1',
        status: 'unreachable',
        range: 'custom',
        from: '2026-10-01',
        to: '2026-10-31',
        limit: '20',
      }),
    ).toEqual({
      folder: 'spam',
      pageId: '64b0000000000000000000a1',
      status: 'unreachable',
      range: 'custom',
      from: '2026-10-01',
      to: '2026-10-31',
      limit: 20,
    });
  });

  it('refuses a search in the URL: it is personal data and goes in a request body', () => {
    expect(leadListQuerySchema.safeParse({ q: '0901' }).error?.issues[0]).toMatchObject({
      code: 'unrecognized_keys',
    });
  });

  it('needs both days of a custom range', () => {
    const result = leadListQuerySchema.safeParse({ range: 'custom', from: '2026-10-01' });
    expect(result.error?.issues[0]).toMatchObject({
      path: ['to'],
      message: 'Chọn ngày bắt đầu và ngày kết thúc',
    });
  });

  it('refuses a custom range that ends before it starts or spans more than 365 days', () => {
    expect(
      leadListQuerySchema.safeParse({ range: 'custom', from: '2026-10-02', to: '2026-10-01' }).error
        ?.issues[0]?.message,
    ).toBe('Ngày kết thúc phải từ ngày bắt đầu trở đi');
    expect(
      leadListQuerySchema.safeParse({ range: 'custom', from: '2026-01-01', to: '2027-01-01' }).error
        ?.issues[0]?.message,
    ).toBe('Chọn tối đa 365 ngày');
    expect(
      leadListQuerySchema.safeParse({ range: 'custom', from: '2026-01-01', to: '2026-12-31' })
        .success,
    ).toBe(true);
  });

  it('refuses unknown values and long searches', () => {
    expect(leadListQuerySchema.safeParse({ folder: 'trash' }).success).toBe(false);
    expect(leadListQuerySchema.safeParse({ status: 'lost' }).success).toBe(false);
    expect(leadListQuerySchema.safeParse({ range: '90d' }).success).toBe(false);
    expect(leadListQuerySchema.safeParse({ from: '25/10/2026' }).success).toBe(false);
    expect(leadListQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
  });

  it('shares its filters and the range rule with the export, which may also search', () => {
    expect(leadFiltersSchema.parse({ status: 'new', range: 'all', q: ' Hà ' })).toEqual({
      folder: 'inbox',
      status: 'new',
      range: 'all',
      q: 'Hà',
    });
    expect(leadFiltersSchema.safeParse({ range: 'custom' }).success).toBe(false);
  });
});

describe('leadSearchRequestSchema', () => {
  it('narrows the list by a search sent in the body, with the same filters and paging', () => {
    expect(leadSearchRequestSchema.parse({ q: ' 0901 ', status: 'new', limit: 20 })).toEqual({
      folder: 'inbox',
      status: 'new',
      range: '7d',
      q: '0901',
      limit: 20,
    });
  });

  it('needs something to search for, at most 80 characters, without control characters', () => {
    expect(leadSearchRequestSchema.safeParse({ q: '   ' }).error?.issues[0]?.message).toBe(
      'Nhập từ khóa tìm kiếm',
    );
    expect(leadSearchRequestSchema.safeParse({ q: 'x'.repeat(81) }).success).toBe(false);
    for (const q of ['thuha@example.com\u0000', 'a\u2028b', 'line\nbreak']) {
      expect(leadSearchRequestSchema.safeParse({ q }).error?.issues[0]?.message).toBe(
        'Từ khóa tìm kiếm có ký tự không hợp lệ',
      );
    }
    expect(leadFiltersSchema.safeParse({ q: 'a\u0000' }).success).toBe(false);
  });

  it('cleans a pasted search the way the schema accepts it', () => {
    expect(cleanLeadSearch(' 0901\n234\u0000567 ')).toBe('0901 234 567');
    expect(cleanLeadSearch('x'.repeat(100))).toHaveLength(80);
    expect(leadSearchRequestSchema.safeParse({ q: cleanLeadSearch('a\u2028b') }).success).toBe(
      true,
    );
  });
});

describe('updateLeadRequestSchema', () => {
  it('changes any of status, note and spam', () => {
    expect(updateLeadRequestSchema.parse({ status: 'won' })).toEqual({ status: 'won' });
    expect(updateLeadRequestSchema.parse({ note: '  gọi lại sau 18h ' })).toEqual({
      note: 'gọi lại sau 18h',
    });
    expect(updateLeadRequestSchema.parse({ spam: true })).toEqual({ spam: true });
  });

  it('refuses an empty change and a note over 1000 characters', () => {
    expect(updateLeadRequestSchema.safeParse({}).error?.issues[0]?.message).toBe(
      'Không có thay đổi nào để lưu',
    );
    expect(
      updateLeadRequestSchema.safeParse({ note: 'a'.repeat(1001) }).error?.issues[0],
    ).toMatchObject({
      path: ['note'],
      message: 'Ghi chú tối đa 1000 ký tự',
    });
  });
});

describe('leadSourceLabel', () => {
  it('writes the source and medium, or "trực tiếp" for a direct visit', () => {
    expect(leadSourceLabel({ source: 'facebook', medium: 'cpc' })).toBe('facebook / cpc');
    expect(leadSourceLabel({ source: '(direct)', medium: '(none)' })).toBe('trực tiếp');
  });
});
