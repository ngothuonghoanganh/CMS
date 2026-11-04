import { describe, expect, it } from 'vitest';
import {
  contactCountLabel,
  contactReachLine,
  contactSourceLines,
  mergeReasonLabel,
  rangeLabel,
} from './contact-presentation';

describe('contact presentation (board 22)', () => {
  it('writes counts the Vietnamese way, with "+" past the cap', () => {
    expect(contactCountLabel({ count: 312, capped: false })).toBe('312');
    expect(contactCountLabel({ count: 9999, capped: true })).toBe('9.999+');
  });

  it('shows the phone number, or the email of a profile without one', () => {
    expect(contactReachLine({ phone: '+84912345678', email: 'a@b.vn' })).toBe('0912 345 678');
    expect(contactReachLine({ phone: null, email: 'trang.nt@gmail.com' })).toBe(
      'trang.nt@gmail.com',
    );
  });

  it('names where a profile comes from', () => {
    expect(
      contactSourceLines({
        leadCount: 2,
        source: {
          kind: 'lead',
          page: { id: '64b0000000000000000000a1', title: 'Ưu đãi niềng răng tháng 11' },
          source: { source: 'facebook', medium: 'cpc' },
        },
      }),
    ).toEqual({ title: 'Ưu đãi niềng răng tháng 11', detail: 'facebook / cpc · 2 lead' });
    expect(
      contactSourceLines({ leadCount: 0, source: { kind: 'manual', channel: 'phone_call' } }),
    ).toEqual({ title: 'Thêm tay · khách gọi điện', detail: '— · 0 lead' });
  });

  it('says why two profiles may be one person', () => {
    expect(mergeReasonLabel({ kind: 'email' })).toBe('Lý do: cùng email, khác số điện thoại');
    expect(
      mergeReasonLabel({
        kind: 'name_page',
        page: { id: '64b0000000000000000000a1', title: 'Niềng răng' },
        days: 2,
      }),
    ).toBe('Lý do: tên giống nhau, cùng đăng ký trang Niềng răng trong 2 ngày');
  });

  it('counts the rows shown', () => {
    expect(rangeLabel(26, 25, { count: 312, capped: false })).toBe('Hiển thị 26–50 trên 312');
    expect(rangeLabel(1, 0, { count: 0, capped: false })).toBe('Hiển thị 0 trên 0');
  });
});
