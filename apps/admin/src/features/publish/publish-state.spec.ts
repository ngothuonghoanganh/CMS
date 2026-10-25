import type { CheckItem, ChecksResult, PageSummary } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import { pageSummary } from '../editor/test-fixtures';
import {
  checksSummaryLine,
  currentAcknowledgements,
  initialPublishState,
  isFirstPublish,
  liveSince,
  nextVersion,
  type PreparedPublish,
  publishDisabledReason,
  publishFooterNote,
  publishReducer,
  type PublishState,
  publishTitle,
  tallyChecks,
} from './publish-state';

const LIVE_RELEASE = {
  id: '64b0000000000000000000e1',
  version: 12,
  slug: 'uu-dai-thang-11',
  publishedAt: '2026-10-22T02:40:00.000Z',
};

function warning(fingerprint: string): CheckItem {
  return {
    code: 'image_alt_missing',
    severity: 'warning',
    fingerprint,
    title: 'Ảnh Hero chưa có mô tả',
    description: 'Người dùng trình đọc màn hình không biết ảnh nói gì.',
    target: { kind: 'section', sectionId: 'hero00000001', fieldPath: 'image' },
  };
}

function blocking(fingerprint: string): CheckItem {
  return {
    code: 'required_field_empty',
    severity: 'blocking',
    fingerprint,
    title: 'Hero chưa có tiêu đề',
    description: 'Nhập tiêu đề cho Hero.',
    target: { kind: 'section', sectionId: 'hero00000001', fieldPath: 'heading' },
  };
}

function checks(overrides: Partial<ChecksResult> = {}): ChecksResult {
  return {
    revision: 5,
    blocking: [],
    warnings: [],
    passed: [
      { code: 'seo_title', title: 'Tiêu đề SEO' },
      { code: 'slug_valid', title: 'Đường dẫn hợp lệ, không trùng' },
    ],
    ...overrides,
  };
}

function livePage(overrides: Partial<PageSummary> = {}): PageSummary {
  return pageSummary({
    status: {
      kind: 'live_with_changes',
      changeCount: 4,
      changes: [{ kind: 'modified', label: 'Sửa: Hero', sectionId: 'hero00000001' }],
    },
    liveRelease: LIVE_RELEASE,
    latestVersion: 12,
    liveUrl: 'https://smilecare.payload.site/uu-dai-thang-11',
    ...overrides,
  });
}

function prepared(result: ChecksResult, page = livePage()): PreparedPublish {
  return { revision: 5, page, checks: result, loadedAt: Date.parse('2026-10-24T08:00:00Z') };
}

function review(result: ChecksResult, acknowledged: string[] = []): PublishState {
  return publishReducer(
    { ...initialPublishState, acknowledged },
    { type: 'prepared', prepared: prepared(result) },
  );
}

describe('publish dialog copy', () => {
  it('titles a first publish differently from publishing changes', () => {
    expect(publishTitle(pageSummary())).toBe('Xuất bản trang');
    expect(publishTitle(livePage())).toBe('Xuất bản 4 thay đổi');
    expect(
      publishTitle(
        livePage({
          status: { kind: 'unpublished', changeCount: 0, changes: [] },
          liveRelease: null,
        }),
      ),
    ).toBe('Xuất bản lại trang');
  });

  it('knows a first publish and the version it creates', () => {
    expect(isFirstPublish(pageSummary())).toBe(true);
    expect(nextVersion(pageSummary())).toBe(1);
    expect(isFirstPublish(livePage())).toBe(false);
    expect(nextVersion(livePage())).toBe(13);
  });

  it('explains what stays safe in the footer', () => {
    expect(publishFooterNote(pageSummary())).toBe(
      'Sau khi xuất bản, trang sẽ có địa chỉ công khai.',
    );
    expect(publishFooterNote(livePage())).toBe(
      'Bản v12 vẫn được lưu. Bạn có thể khôi phục bất cứ lúc nào trong Lịch sử phiên bản.',
    );
  });

  it('dates the live version from the pointer move that made it live', () => {
    expect(liveSince(pageSummary())).toBeNull();
    expect(liveSince(livePage())).toBe(LIVE_RELEASE.publishedAt);
    const restored = livePage({
      lastPointerEvent: {
        type: 'rolled_back',
        version: 12,
        by: { id: '64b0000000000000000000c1', name: 'Minh' },
        at: '2026-10-24T10:20:00.000Z',
      },
    });
    expect(liveSince(restored)).toBe('2026-10-24T10:20:00.000Z');
  });
});

describe('checks tally', () => {
  it('summarises blocking errors, open and skipped warnings and passed items', () => {
    const result = checks({ blocking: [blocking('b1')], warnings: [warning('w1'), warning('w2')] });
    expect(checksSummaryLine(tallyChecks(result, ['w2']))).toBe(
      '1 lỗi chặn · 1 cảnh báo · 1 đã bỏ qua · 2 đạt',
    );
    expect(checksSummaryLine(tallyChecks(checks(), []))).toBe('Không có lỗi hay cảnh báo · 2 đạt');
  });

  it('disables publishing while a blocking error is left, then while a warning is open', () => {
    const blocked = checks({ blocking: [blocking('b1')], warnings: [warning('w1')] });
    expect(publishDisabledReason(tallyChecks(blocked, ['w1']))).toBe('Sửa 1 lỗi để xuất bản');

    const warned = checks({ warnings: [warning('w1'), warning('w2')] });
    expect(publishDisabledReason(tallyChecks(warned, []))).toBe('Sửa hoặc bỏ qua 2 cảnh báo');
    expect(publishDisabledReason(tallyChecks(warned, ['w1']))).toBe('Sửa hoặc bỏ qua 1 cảnh báo');
    expect(publishDisabledReason(tallyChecks(warned, ['w1', 'w2']))).toBeNull();
  });

  it('ignores acknowledgements of warnings that no longer exist', () => {
    const result = checks({ warnings: [warning('w1')] });
    expect(currentAcknowledgements(result, ['gone', 'w1'])).toEqual(['w1']);
    expect(tallyChecks(result, ['gone'])).toEqual({
      blocking: 0,
      openWarnings: 1,
      ignored: 0,
      passed: 2,
    });
  });
});

describe('publishReducer', () => {
  it('starts preparing and moves to review with the prepared data', () => {
    expect(initialPublishState.phase).toBe('preparing');
    const state = review(checks({ warnings: [warning('w1')] }));
    expect(state.phase).toBe('review');
    expect(state.prepared?.revision).toBe(5);
  });

  it('toggles a warning between skipped and open', () => {
    const state = review(checks({ warnings: [warning('w1'), warning('w2')] }));
    const skipped = publishReducer(state, { type: 'warning_toggled', fingerprint: 'w1' });
    expect(skipped.acknowledged).toEqual(['w1']);
    const undone = publishReducer(skipped, { type: 'warning_toggled', fingerprint: 'w1' });
    expect(undone.acknowledged).toEqual([]);
  });

  it('does not change acknowledgements or the note while publishing', () => {
    const state = publishReducer(review(checks({ warnings: [warning('w1')] })), {
      type: 'submit_started',
    });
    expect(state.submitting).toBe(true);
    expect(publishReducer(state, { type: 'warning_toggled', fingerprint: 'w1' })).toBe(state);
    expect(publishReducer(state, { type: 'note_changed', note: 'x' })).toBe(state);
  });

  it('keeps acknowledgements of warnings that are still there after the checks change', () => {
    const state = review(checks({ warnings: [warning('w1'), warning('w2')] }), ['w1', 'w2']);
    const refreshed = publishReducer(state, {
      type: 'checks_refreshed',
      checks: checks({ warnings: [warning('w2'), warning('w3')] }),
      notice: { title: 'Kết quả kiểm tra đã thay đổi', message: '…' },
    });
    expect(refreshed.acknowledged).toEqual(['w2']);
    expect(refreshed.notice?.title).toBe('Kết quả kiểm tra đã thay đổi');
    expect(refreshed.prepared?.checks.warnings.map((item) => item.fingerprint)).toEqual([
      'w2',
      'w3',
    ]);
  });

  it('keeps the note and acknowledgements when preparing again after a conflict', () => {
    let state = review(checks({ warnings: [warning('w1')] }), ['w1']);
    state = publishReducer(state, { type: 'note_changed', note: 'Đổi ảnh hero' });
    state = publishReducer(state, {
      type: 'prepare_started',
      notice: { title: 'Trang vừa thay đổi trong lúc xuất bản', message: '…' },
    });
    expect(state.phase).toBe('preparing');
    state = publishReducer(state, {
      type: 'prepared',
      prepared: prepared(checks({ warnings: [warning('w1')] })),
    });
    expect(state.note).toBe('Đổi ảnh hero');
    expect(state.acknowledged).toEqual(['w1']);
    expect(state.notice?.title).toBe('Trang vừa thay đổi trong lúc xuất bản');
  });

  it('shows a failed attempt and clears it on the next one', () => {
    const failed = publishReducer(publishReducer(review(checks()), { type: 'submit_started' }), {
      type: 'submit_failed',
      message: 'Máy chủ đang gặp sự cố',
    });
    expect(failed.submitting).toBe(false);
    expect(failed.error).toBe('Máy chủ đang gặp sự cố');
    expect(publishReducer(failed, { type: 'submit_started' }).error).toBeNull();
  });
});
