import { describe, expect, it } from 'vitest';
import {
  checksSummaryView,
  displayUrl,
  frameLayout,
  liveStatusView,
  livePathOf,
  lowerFirst,
  publishButtonLabel,
  relativeTime,
  saveStatusView,
} from './presentation';
import { emptyChecks, pageSummary, RELEASE_ID } from './test-fixtures';

const NOW = new Date('2026-10-24T10:00:00.000Z');
const liveRelease = {
  id: RELEASE_ID,
  version: 12,
  slug: 'uu-dai-thang-11',
  publishedAt: '2026-10-20T08:00:00.000Z',
};

function item(severity: 'blocking' | 'warning') {
  return {
    code: severity === 'blocking' ? ('required_field_empty' as const) : ('sample_content' as const),
    severity,
    fingerprint: 'x',
    title: 't',
    description: 'd',
    target: { kind: 'page' as const },
  };
}

describe('editor presentation', () => {
  it('formats relative save times', () => {
    expect(relativeTime('2026-10-24T09:59:30.000Z', NOW)).toBe('vừa xong');
    expect(relativeTime('2026-10-24T09:55:00.000Z', NOW)).toBe('5 phút trước');
    expect(relativeTime('2026-10-24T07:00:00.000Z', NOW)).toBe('3 giờ trước');
    expect(relativeTime('2026-10-20T07:00:00.000Z', NOW)).toMatch(/^\d{2}\/10\/2026$/);
  });

  it('describes every save state', () => {
    expect(saveStatusView('saved', '2026-10-24T09:59:50.000Z', null, NOW)).toEqual({
      tone: 'success',
      text: 'Đã lưu bản nháp · vừa xong',
      canRetry: false,
    });
    expect(saveStatusView('saved', '2026-10-24T09:59:50.000Z', null, null).text).toBe(
      'Đã lưu bản nháp',
    );
    expect(saveStatusView('saving', null, null, NOW).text).toBe('Đang lưu…');
    expect(saveStatusView('dirty', null, null, NOW).text).toBe('Có thay đổi chưa lưu');
    expect(saveStatusView('error', null, { kind: 'retryable', message: 'x' }, NOW)).toMatchObject({
      text: 'Chưa lưu được',
      canRetry: true,
    });
    expect(saveStatusView('error', null, { kind: 'invalid', message: 'x' }, NOW).canRetry).toBe(
      false,
    );
    expect(saveStatusView('conflict', null, null, NOW).tone).toBe('danger');
  });

  it('describes the live status of the page', () => {
    expect(
      liveStatusView(
        pageSummary({
          status: { kind: 'live_with_changes', changeCount: 4, changes: [] },
          liveRelease,
          latestVersion: 12,
        }),
      ),
    ).toEqual({ kind: 'live_with_changes', text: 'Live v12 · 4 thay đổi chưa xuất bản' });
    expect(
      liveStatusView(
        pageSummary({ status: { kind: 'live', changeCount: 0, changes: [] }, liveRelease }),
      ).text,
    ).toBe('Live v12');
    expect(liveStatusView(pageSummary()).text).toBe('Chưa xuất bản');
    expect(
      liveStatusView(pageSummary({ status: { kind: 'unpublished', changeCount: 0, changes: [] } }))
        .text,
    ).toBe('Đã gỡ');
  });

  it('summarizes checks', () => {
    expect(checksSummaryView(emptyChecks)).toEqual({ tone: 'success', text: 'Sẵn sàng xuất bản' });
    expect(
      checksSummaryView({
        ...emptyChecks,
        blocking: [item('blocking')],
        warnings: [item('warning'), item('warning')],
      }),
    ).toEqual({ tone: 'danger', text: '1 lỗi · 2 cảnh báo' });
    expect(checksSummaryView({ ...emptyChecks, warnings: [item('warning')] })).toEqual({
      tone: 'warning',
      text: '1 cảnh báo',
    });
  });

  it('labels the publish button and live paths', () => {
    expect(publishButtonLabel(pageSummary())).toBe('Xuất bản');
    expect(
      publishButtonLabel(
        pageSummary({ status: { kind: 'live', changeCount: 0, changes: [] }, liveRelease }),
      ),
    ).toBe('Xuất bản thay đổi');
    expect(livePathOf({ liveRelease })).toBe('/uu-dai-thang-11');
    expect(livePathOf({ liveRelease: { ...liveRelease, slug: '' } })).toBe('/');
    expect(livePathOf({ liveRelease: null })).toBeNull();
  });

  it('shortens URLs and lowercases item labels', () => {
    expect(displayUrl('https://go.smilecare.vn/uu-dai-thang-11')).toBe(
      'go.smilecare.vn/uu-dai-thang-11',
    );
    expect(displayUrl('https://smilecare.payload.site/')).toBe('smilecare.payload.site');
    expect(lowerFirst('Lợi ích')).toBe('lợi ích');
  });

  it('lays the frame out at a real device width and zooms it to fit the canvas', () => {
    expect(frameLayout('desktop', 1400)).toEqual({ width: 1280, zoom: 1 });
    expect(frameLayout('desktop', 1100)).toEqual({ width: 1100, zoom: 1 });
    expect(frameLayout('desktop', 632)).toEqual({ width: 1024, zoom: 0.61 });
    expect(frameLayout('tablet', 900)).toEqual({ width: 768, zoom: 1 });
    expect(frameLayout('tablet', 632)).toEqual({ width: 768, zoom: 0.82 });
    expect(frameLayout('mobile', 632)).toEqual({ width: 390, zoom: 1 });
    expect(frameLayout('desktop', null)).toEqual({ width: null, zoom: 1 });
    expect(frameLayout('mobile', null)).toEqual({ width: 390, zoom: 1 });
  });
});
