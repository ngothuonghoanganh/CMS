import { describe, expect, it } from 'vitest';
import { siteFixture } from '../dashboard/test-fixtures';
import {
  accessChangeSummary,
  assignableRoles,
  invitationStatus,
  inviteEmailProblem,
  knownEmails,
  matchesFilters,
  type PeopleFilters,
  permissionSummary,
  scopeLabel,
  siteChange,
  splitEmailInput,
  type SummaryPart,
} from './member-presentation';

const NOW = Date.parse('2026-11-01T03:00:00.000Z');
const smile = siteFixture();
const spa = siteFixture({ id: '64b000000000000000000002', name: 'Spa Lá Xanh' });
const kitchen = siteFixture({ id: '64b000000000000000000003', name: 'Bếp Nhà Mây' });

function sentence(parts: readonly SummaryPart[]): string {
  return parts.map((part) => (part.strong ? `**${part.text}**` : part.text)).join('');
}

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

  it('ends an email at a comma, a space or a semicolon, keeping what is still typed', () => {
    expect(splitEmailInput('Thuy@smilecare.vn, an@bep.vn;b@c.vn\nkhoa@')).toEqual({
      complete: ['thuy@smilecare.vn', 'an@bep.vn', 'b@c.vn'],
      rest: 'khoa@',
    });
    expect(splitEmailInput('an@bep.vn ')).toEqual({ complete: ['an@bep.vn'], rest: '' });
    expect(splitEmailInput(' ,')).toEqual({ complete: [], rest: '' });
    expect(splitEmailInput('Thuy@')).toEqual({ complete: [], rest: 'Thuy@' });
  });

  it('tells at once which emails are not to be invited, whatever their case', () => {
    const known = knownEmails([{ email: 'khoa@mayxanh.vn' }], [{ email: 'an.tran@bepnhamay.vn' }]);
    expect(inviteEmailProblem('thuy@smilecare.vn', known)).toBeNull();
    expect(inviteEmailProblem('Khoa@MayXanh.vn', known)).toBe('member');
    expect(inviteEmailProblem('an.tran@bepnhamay.vn', known)).toBe('invited');
    expect(inviteEmailProblem('khong-hop-le', known)).toBe('invalid');
    expect(inviteEmailProblem('thuy@', known)).toBe('invalid');
  });

  it('filters members and invitations alike by role, site and name or email', () => {
    const all: PeopleFilters = { role: 'all', siteId: 'all', search: '' };
    const editor = { role: 'editor' as const, siteIds: [smile.id], email: 'an@bep.vn' };
    const custom = {
      role: { customRoleId: '64b0000000000000000000d9', name: 'Trưởng nhóm', permissions: [] },
      siteIds: null,
      name: 'Minh Khoa',
      email: 'khoa@mayxanh.vn',
    };
    expect(matchesFilters(editor, all)).toBe(true);
    expect(matchesFilters(editor, { ...all, role: 'viewer' })).toBe(false);
    expect(matchesFilters(custom, { ...all, role: 'custom:64b0000000000000000000d9' })).toBe(true);
    expect(matchesFilters(editor, { ...all, siteId: spa.id })).toBe(false);
    // The whole workspace includes every site.
    expect(matchesFilters(custom, { ...all, siteId: spa.id })).toBe(true);
    expect(matchesFilters(custom, { ...all, search: ' minh ' })).toBe(true);
    expect(matchesFilters(editor, { ...all, search: 'AN@' })).toBe(true);
    expect(matchesFilters(editor, { ...all, search: 'khoa' })).toBe(false);
  });

  it('searches names without minding accents, as the lead inbox does (ADR-018)', () => {
    const all: PeopleFilters = { role: 'all', siteId: 'all', search: '' };
    const member = {
      role: 'editor' as const,
      siteIds: null,
      name: 'Trần Ngọc Đức',
      email: 'duc@mayxanh.vn',
    };
    expect(matchesFilters(member, { ...all, search: 'ngoc' })).toBe(true);
    expect(matchesFilters(member, { ...all, search: 'NGOC  duc' })).toBe(true);
    expect(matchesFilters(member, { ...all, search: 'tran ngọc' })).toBe(true);
    expect(matchesFilters(member, { ...all, search: 'ngoc anh' })).toBe(false);
  });

  it('sums up a change of access in the board’s words', () => {
    const sites = [smile, kitchen, spa];
    expect(
      sentence(
        accessChangeSummary(
          { role: 'editor', siteIds: [smile.id, kitchen.id] },
          { role: 'editor', siteIds: [smile.id, spa.id] },
          sites,
        ),
      ),
    ).toBe('Thêm quyền Biên tập trên **Spa Lá Xanh**. Gỡ quyền trên **Bếp Nhà Mây**.');
    expect(
      sentence(
        accessChangeSummary(
          { role: 'editor', siteIds: [smile.id] },
          { role: 'viewer', siteIds: [smile.id] },
          sites,
        ),
      ),
    ).toBe('Đổi vai trò **Biên tập** → **Chỉ xem**.');
    expect(
      sentence(
        accessChangeSummary(
          { role: 'viewer', siteIds: [smile.id] },
          { role: 'admin', siteIds: null },
          sites,
        ),
      ),
    ).toBe(
      'Đổi vai trò **Chỉ xem** → **Quản trị**. Thêm quyền Quản trị trên **toàn workspace**, gồm site tạo sau này.',
    );
    expect(
      sentence(
        accessChangeSummary(
          { role: 'editor', siteIds: null },
          { role: 'editor', siteIds: [smile.id, spa.id] },
          sites,
        ),
      ),
    ).toBe('Gỡ quyền trên **toàn workspace**, chỉ giữ **Nha khoa Smile Care**, **Spa Lá Xanh**.');
    expect(
      sentence(
        accessChangeSummary(
          { role: 'editor', siteIds: [smile.id, '64b0000000000000000000ff'] },
          { role: 'editor', siteIds: [] },
          sites,
        ),
      ),
    ).toBe('Gỡ quyền trên **Nha khoa Smile Care**, 1 site khác.');
    expect(
      sentence(
        accessChangeSummary(
          { role: 'editor', siteIds: [kitchen.id, smile.id] },
          { role: 'editor', siteIds: [smile.id, kitchen.id] },
          sites,
        ),
      ),
    ).toBe('Chưa có thay đổi.');
  });
});
