import type { Domain } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import { connectHeading, diagnosisLine, movedPagesLine } from './domain-presentation';
import { domainFixture } from './test-fixtures';

// 10:00 in Vietnam.
const NOW = '2026-11-01T03:00:00.000Z';

const cname = (state: 'missing' | 'ok' | 'wrong') =>
  ({ type: 'CNAME', name: 'go.smilecare.vn', value: 'cname.payload.site', state }) as const;
const txt = (state: 'missing' | 'ok' | 'wrong') =>
  ({ type: 'TXT', name: '_payload.go.smilecare.vn', value: 'payload-verify=8f3a', state }) as const;

function line(overrides: Partial<Domain>, redirectsTo: string | null = null): string {
  return diagnosisLine(domainFixture(overrides), redirectsTo, NOW);
}

describe('diagnosisLine (board 13)', () => {
  it('says since when and by whom an active domain works, or where it redirects', () => {
    expect(line({ primary: true }, 'go.smilecare.vn')).toBe('Kết nối từ 14/10/2026 bởi Ngọc Anh.');
    expect(line({})).toBe('Kết nối từ 14/10/2026 bởi Ngọc Anh.');
    expect(line({ hostname: 'smilecare.vn', kind: 'apex' }, 'go.smilecare.vn')).toBe(
      'Tên miền gốc · đang chuyển hướng → go.smilecare.vn',
    );
    expect(line({ hostname: 'uudai.smilecare.vn' }, 'go.smilecare.vn')).toBe(
      'Tên miền phụ · đang chuyển hướng → go.smilecare.vn',
    );
  });

  it('says which records are missing while DNS is awaited', () => {
    expect(line({ status: 'pending_dns', records: [cname('missing'), txt('missing')] })).toBe(
      'Chưa thấy bản ghi CNAME và TXT.',
    );
    expect(line({ status: 'pending_dns', records: [cname('ok'), txt('missing')] })).toBe(
      'Chưa thấy bản ghi TXT.',
    );
  });

  it('tells a record of the wrong type from a wrong value, and a wrong TXT', () => {
    expect(
      line({
        status: 'misconfigured',
        records: [cname('wrong'), txt('ok')],
        found: [{ type: 'A', value: '103.97.125.18' }],
      }),
    ).toBe('Đang có bản ghi A, cần đổi sang CNAME.');
    expect(
      line({
        status: 'misconfigured',
        records: [cname('wrong'), txt('ok')],
        found: [{ type: 'CNAME', value: 'old-host.example.vn' }],
      }),
    ).toBe('CNAME đang trỏ tới old-host.example.vn, chưa đúng giá trị.');
    expect(line({ status: 'misconfigured', records: [cname('ok'), txt('wrong')] })).toBe(
      'Bản ghi TXT chưa đúng mã xác minh của site này.',
    );
  });

  it('says when a lost domain stopped pointing here, and where it points now', () => {
    expect(
      line({
        status: 'lost',
        lostSince: '2026-11-01T01:12:00.000Z',
        found: [{ type: 'A', value: '45.119.84.10' }],
      }),
    ).toBe('CNAME đổi lúc 08:12 hôm nay, đang trỏ tới 45.119.84.10.');
    expect(line({ status: 'lost', lostSince: '2026-10-31T09:30:00.000Z', found: [] })).toBe(
      'Bản ghi CNAME đã bị xóa lúc 16:30 hôm qua.',
    );
    expect(line({ status: 'lost', lostSince: '2026-10-20T09:30:00.000Z', found: [] })).toBe(
      'Bản ghi CNAME đã bị xóa lúc 16:30 20/10/2026.',
    );
  });

  it('describes the other states as board 14 does', () => {
    expect(line({ status: 'issuing' })).toBe('DNS đúng, đã xác minh quyền sở hữu.');
    expect(line({ status: 'needs_attention' })).toBe(
      'DNS đúng nhưng chưa bật được HTTPS sau một giờ.',
    );
    expect(line({ status: 'taken' })).toBe(
      'Một site khác đang dùng tên miền này. Thêm bản ghi TXT để chứng minh nó là của bạn.',
    );
  });
});

describe('connectHeading (board 14)', () => {
  it('follows where the domain stands', () => {
    expect(connectHeading(null)).toBe('Bạn muốn dùng tên miền nào?');
    expect(connectHeading('pending_dns')).toBe('Thêm bản ghi DNS');
    expect(connectHeading('misconfigured')).toBe('Sửa bản ghi DNS');
    expect(connectHeading('taken')).toBe('Xác minh quyền sở hữu');
    expect(connectHeading('issuing')).toBe('Đang bật HTTPS');
    expect(connectHeading('active')).toBe('Đã kết nối');
  });
});

describe('movedPagesLine ("Đặt làm chính")', () => {
  it('counts the live pages with an example address', () => {
    expect(movedPagesLine({ count: 6, exampleSlug: 'uu-dai-nieng-rang' }, 'smilecare.vn')).toBe(
      '6 trang đang live sẽ có địa chỉ mới, ví dụ smilecare.vn/uu-dai-nieng-rang.',
    );
    expect(movedPagesLine({ count: 1, exampleSlug: '' }, 'smilecare.vn')).toBe(
      '1 trang đang live sẽ có địa chỉ mới, ví dụ smilecare.vn.',
    );
    expect(movedPagesLine({ count: 0, exampleSlug: null }, 'smilecare.vn')).toBe(
      'Chưa có trang nào đang live; các trang xuất bản sau sẽ dùng địa chỉ này.',
    );
  });
});
