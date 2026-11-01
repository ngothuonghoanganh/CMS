import { describe, expect, it } from 'vitest';
import { siteFixture } from '../dashboard/test-fixtures';
import {
  assignableRoles,
  invitationStatus,
  parseEmails,
  permissionSummary,
  scopeLabel,
  siteChange,
} from './member-presentation';

const NOW = Date.parse('2026-11-01T03:00:00.000Z');
const smile = siteFixture();
const spa = siteFixture({ id: '64b000000000000000000002', name: 'Spa Lá Xanh' });

describe('member presentation', () => {
  it('offers every role but Chủ sở hữu', () => {
    expect(assignableRoles.map((role) => role.label)).toEqual([
      'Quản trị',
      'Biên tập',
      'Cộng tác viên',
      'Chăm sóc khách hàng',
      'Chỉ xem',
    ]);
  });

  it('names the scope', () => {
    expect(scopeLabel(null, [smile])).toBe('Toàn workspace');
    expect(scopeLabel([smile.id, spa.id], [smile, spa])).toBe('Nha khoa Smile Care, Spa Lá Xanh');
    expect(scopeLabel(['64b0000000000000000000ff'], [smile])).toBe('1 site');
  });

  it('tells how long an invitation still works', () => {
    const sentAt = '2026-10-30T03:00:00.000Z';
    expect(invitationStatus({ expiresAt: '2026-11-06T03:00:00.000Z', sentAt }, NOW)).toEqual({
      label: 'Hết hạn sau 5 ngày',
      tone: 'primary',
    });
    expect(invitationStatus({ expiresAt: '2026-11-01T02:59:00.000Z', sentAt }, NOW).label).toBe(
      'Đã hết hạn',
    );
    expect(
      invitationStatus({ expiresAt: '2026-11-06T03:00:00.000Z', sentAt: null }, NOW).label,
    ).toBe('Chưa gửi được');
    // Read on a screen loaded just before the invitation was sent: still 7 days, at least 1.
    expect(invitationStatus({ expiresAt: '2026-11-08T03:05:00.000Z', sentAt }, NOW).label).toBe(
      'Hết hạn sau 7 ngày',
    );
    expect(invitationStatus({ expiresAt: '2026-11-01T05:00:00.000Z', sentAt }, NOW).label).toBe(
      'Hết hạn sau 1 ngày',
    );
  });

  it('sums up what a role may do from the permission table', () => {
    const { allowed, denied } = permissionSummary('support');
    expect(allowed).toContain('Xem lead và nơi nhận lead');
    expect(denied).toContain('Xuất lead ra CSV / Excel');
    expect(denied).toContain('Sửa bản nháp, section, SEO, tải ảnh lên');
    // A Cộng tác viên publishes once Chủ sở hữu or Quản trị approves (ADR-023).
    const contributor = permissionSummary('contributor');
    expect(contributor.allowed).toContain('Xuất bản, cập nhật trang live (cần được duyệt)');
    expect(contributor.denied).not.toContain('Xuất bản, cập nhật trang live');
  });

  it('marks the sites a change adds or removes', () => {
    expect(siteChange(smile.id, [smile.id], [spa.id])).toBe('remove');
    expect(siteChange(spa.id, [smile.id], [spa.id])).toBe('add');
    expect(siteChange(spa.id, null, null)).toBeNull();
    expect(siteChange(spa.id, [smile.id], null)).toBe('add');
  });

  it('reads emails typed in one field', () => {
    expect(parseEmails(' Thuy@smilecare.vn, an@bep.vn;an@bep.vn\nb@c.vn ')).toEqual([
      'thuy@smilecare.vn',
      'an@bep.vn',
      'b@c.vn',
    ]);
  });
});
