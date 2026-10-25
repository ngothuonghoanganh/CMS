import type { ActivityItem } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import { activitySentence } from './activity-sentence';
import { activityFixture, minh } from './test-fixtures';

function sentence(overrides: Partial<ActivityItem>): string {
  const result = activitySentence(activityFixture(overrides));
  return `${result.actor} ${result.text} [${result.tone}]`;
}

const noVersions = {
  version: null,
  fromVersion: null,
  toVersion: null,
  count: null,
  revalidationFailed: false,
};

describe('activitySentence', () => {
  it('describes a publish', () => {
    expect(sentence({})).toBe('Ngọc Anh xuất bản v12 của “Ưu đãi niềng răng tháng 11” [success]');
    expect(sentence({ data: noVersions })).toBe(
      'Ngọc Anh xuất bản “Ưu đãi niềng răng tháng 11” [success]',
    );
  });

  it('describes a rollback with both versions', () => {
    expect(
      sentence({
        type: 'page.rolled_back',
        actor: minh,
        page: { id: '64b000000000000000000102', title: 'Cấy ghép Implant' },
        data: {
          version: null,
          fromVersion: 6,
          toVersion: 5,
          count: null,
          revalidationFailed: false,
        },
      }),
    ).toBe('Minh khôi phục “Cấy ghép Implant” từ v6 về v5 [warning]');
    expect(sentence({ type: 'page.rolled_back', data: noVersions })).toBe(
      'Ngọc Anh khôi phục “Ưu đãi niềng răng tháng 11” [warning]',
    );
  });

  it('describes an undone rollback', () => {
    expect(sentence({ type: 'page.rollback_undone' })).toBe(
      'Ngọc Anh hoàn tác khôi phục “Ưu đãi niềng răng tháng 11” [warning]',
    );
  });

  it('describes an unpublish', () => {
    expect(
      sentence({
        type: 'page.unpublished',
        page: { id: '64b000000000000000000103', title: 'Tri ân khách hàng 2025' },
      }),
    ).toBe('Ngọc Anh gỡ xuất bản “Tri ân khách hàng 2025” [muted]');
  });

  it('describes page and site creation and uploads', () => {
    expect(sentence({ type: 'page.created', data: noVersions })).toBe(
      'Ngọc Anh tạo trang “Ưu đãi niềng răng tháng 11” [primary]',
    );
    expect(sentence({ type: 'site.created', page: null, data: noVersions })).toBe(
      'Ngọc Anh tạo site [primary]',
    );
    expect(sentence({ type: 'asset.uploaded', page: null, data: noVersions })).toBe(
      'Ngọc Anh tải ảnh lên [primary]',
    );
  });

  it('describes lead exports and deletions with counts only (ADR-018, rule 10)', () => {
    expect(
      sentence({ type: 'lead.exported', page: null, data: { ...noVersions, count: 48 } }),
    ).toBe('Ngọc Anh xuất dữ liệu 48 lead [primary]');
    expect(
      sentence({ type: 'lead.person_deleted', page: null, data: { ...noVersions, count: 3 } }),
    ).toBe('Ngọc Anh xóa dữ liệu của một người gửi form (3 lead) [muted]');
    expect(sentence({ type: 'lead.exported', page: null, data: noVersions })).toBe(
      'Ngọc Anh xuất dữ liệu lead [primary]',
    );
    expect(
      sentence({ type: 'lead.recipients_changed', page: null, data: { ...noVersions, count: 2 } }),
    ).toBe('Ngọc Anh đổi nơi nhận lead (còn 2 địa chỉ) [primary]');
  });

  it('describes changes to the personal data settings and consent texts (ADR-017)', () => {
    expect(sentence({ type: 'privacy.updated', page: null, data: noVersions })).toBe(
      'Ngọc Anh cập nhật cài đặt dữ liệu cá nhân [primary]',
    );
    expect(
      sentence({
        type: 'consent.version_created',
        page: null,
        data: {
          version: 3,
          fromVersion: null,
          toVersion: null,
          count: null,
          revalidationFailed: false,
        },
      }),
    ).toBe('Ngọc Anh lưu nội dung đồng ý bản 3 [primary]');
  });

  it('describes copying a release into the draft', () => {
    expect(
      sentence({
        type: 'page.draft_restored',
        data: {
          version: 8,
          fromVersion: null,
          toVersion: null,
          count: null,
          revalidationFailed: false,
        },
      }),
    ).toBe('Ngọc Anh sao chép v8 vào bản nháp của “Ưu đãi niềng răng tháng 11” [primary]');
    expect(sentence({ type: 'page.draft_restored', data: noVersions })).toBe(
      'Ngọc Anh sao chép vào bản nháp của “Ưu đãi niềng răng tháng 11” [primary]',
    );
  });

  it('names a page event without a page reference generically', () => {
    expect(sentence({ type: 'page.unpublished', page: null })).toBe(
      'Ngọc Anh gỡ xuất bản “một trang” [muted]',
    );
  });
});
