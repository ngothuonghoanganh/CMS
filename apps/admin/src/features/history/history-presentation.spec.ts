import type { HistoryEntry } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import {
  byline,
  latestRollback,
  loadedReleaseCount,
  olderEntriesLabel,
  type PointerEntry,
  pointerEntryView,
  releaseChangesLine,
  restorableRelease,
  timeOfDayLabel,
} from './history-presentation';

const ngocAnh = { id: '64b0000000000000000000c1', name: 'Ngọc Anh' };

function release(version: number, id: string): HistoryEntry {
  return {
    kind: 'release',
    release: {
      id,
      pageId: '64b000000000000000000002',
      version,
      slug: 'uu-dai-thang-11',
      note: '',
      changeSummary: [],
      sourceRevision: version,
      createdBy: ngocAnh,
      createdAt: '2026-10-22T02:40:00.000Z',
    },
  };
}

function pointer(overrides: Partial<PointerEntry> = {}): PointerEntry {
  return {
    kind: 'pointer',
    activityId: '64b0000000000000000000f1',
    type: 'rolled_back',
    fromVersion: 12,
    toVersion: 11,
    reason: 'Giá ưu đãi mới chưa được duyệt',
    by: ngocAnh,
    at: '2026-10-24T10:20:00.000Z',
    undoable: true,
    ...overrides,
  };
}

describe('pointerEntryView', () => {
  it('maps each pointer move to its badge and sentence', () => {
    expect(pointerEntryView(pointer())).toEqual({
      badge: 'KHÔI PHỤC',
      tone: 'warning',
      title: 'v11',
      sentence: 'Chuyển trang live từ v12 sang v11',
    });
    expect(
      pointerEntryView(pointer({ type: 'rollback_undone', fromVersion: 11, toVersion: 12 })),
    ).toEqual({
      badge: 'HOÀN TÁC',
      tone: 'info',
      title: 'v12',
      sentence: 'Chuyển trang live từ v11 sang v12',
    });
    expect(pointerEntryView(pointer({ type: 'unpublished', toVersion: null }))).toEqual({
      badge: 'ĐÃ GỠ',
      tone: 'muted',
      title: null,
      sentence: 'Gỡ trang khỏi internet',
    });
  });

  it('describes a rollback of a page that was not live', () => {
    expect(pointerEntryView(pointer({ fromVersion: null, toVersion: 3 })).sentence).toBe(
      'Đưa v3 lên live',
    );
  });
});

describe('release lines', () => {
  it('joins the changes as on the board', () => {
    expect(
      releaseChangesLine({
        version: 12,
        changeSummary: [
          { kind: 'modified', label: 'Sửa: Ưu đãi & bảng giá', sectionId: 'benefits0001' },
          { kind: 'seo', label: 'SEO: mô tả', sectionId: null },
        ],
      }),
    ).toBe('Sửa: Ưu đãi & bảng giá · SEO: mô tả');
    // A republish that only applied new site settings (ADR-015).
    expect(
      releaseChangesLine({
        version: 13,
        changeSummary: [{ kind: 'site', label: 'Giao diện site: logo', sectionId: null }],
      }),
    ).toBe('Giao diện site: logo');
    expect(releaseChangesLine({ version: 1, changeSummary: [] })).toBe('Phiên bản đầu tiên');
    expect(releaseChangesLine({ version: 4, changeSummary: [] })).toBe(
      'Không có thay đổi so với bản trước',
    );
  });

  it('writes who and when in the admin time zone', () => {
    expect(byline('Ngọc Anh', '2026-10-24T08:02:00.000Z')).toBe('Ngọc Anh · 24/10/2026 15:02');
  });
});

describe('history list helpers', () => {
  const items: HistoryEntry[] = [pointer(), release(12, 'r12'), release(11, 'r11')];

  it('counts the older versions still to load', () => {
    expect(loadedReleaseCount(items)).toBe(2);
    expect(olderEntriesLabel(10, 2)).toBe('Xem thêm 8 phiên bản cũ hơn');
    expect(olderEntriesLabel(2, 2)).toBe('Xem thêm lịch sử cũ hơn');
  });

  it('shows the rollback banner only while the newest entry is a rollback', () => {
    expect(latestRollback(items)?.activityId).toBe('64b0000000000000000000f1');
    expect(latestRollback([release(13, 'r13'), ...items])).toBeNull();
    expect(latestRollback([pointer({ type: 'rollback_undone' }), ...items])).toBeNull();
    expect(latestRollback([])).toBeNull();
  });

  it('finds the release to restore unless it is live already', () => {
    expect(restorableRelease(items, 'r11', 'r12')?.version).toBe(11);
    expect(restorableRelease(items, 'r12', 'r12')).toBeNull();
    expect(restorableRelease(items, 'unknown', 'r12')).toBeNull();
    expect(restorableRelease(items, null, 'r12')).toBeNull();
    expect(restorableRelease(items, 'r12', null)?.version).toBe(12);
  });

  it('writes only the time for something that happened today', () => {
    const now = '2026-10-24T12:00:00.000Z';
    expect(timeOfDayLabel('2026-10-24T10:20:00.000Z', now)).toBe('17:20');
    expect(timeOfDayLabel('2026-10-22T10:20:00.000Z', now)).toBe('22/10/2026 17:20');
  });
});
