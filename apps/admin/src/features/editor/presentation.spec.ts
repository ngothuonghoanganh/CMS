import { describe, expect, it } from 'vitest';
import {
  checksSummaryView,
  displayUrl,
  frameLayout,
  frameStyle,
  hasSiteChanges,
  liveStatusView,
  livePathOf,
  lowerFirst,
  publishButtonLabel,
  saveStatusView,
  siteChangesNotice,
} from './presentation';
import { emptyChecks, pageSummary, RELEASE_ID } from './test-fixtures';

const NOW = new Date('2026-10-24T10:00:00.000Z');
const liveRelease = {
  id: RELEASE_ID,
  version: 12,
  slug: 'uu-dai-thang-11',
  publishedAt: '2026-10-20T08:00:00.000Z',
};
const siteChange = { kind: 'site' as const, label: 'Giao diện site: giao diện', sectionId: null };

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
  it('formats relative save times with the shared admin formatter', () => {
    const at = (iso: string) => saveStatusView('saved', iso, null, NOW).time;
    expect(at('2026-10-24T09:59:30.000Z')).toBe('vừa xong');
    expect(at('2026-10-24T09:55:00.000Z')).toBe('5 phút trước');
    expect(at('2026-10-24T07:00:00.000Z')).toBe('3 giờ trước');
    // NOW is 17:00 in Asia/Ho_Chi_Minh; the day before reads like the dashboard.
    expect(at('2026-10-23T09:20:00.000Z')).toBe('hôm qua, 16:20');
    expect(at('2026-10-20T07:00:00.000Z')).toBe('20/10');
  });

  it('describes every save state', () => {
    expect(saveStatusView('saved', '2026-10-24T09:59:50.000Z', null, NOW)).toEqual({
      tone: 'success',
      text: 'Đã lưu bản nháp',
      time: 'vừa xong',
      canRetry: false,
    });
    expect(saveStatusView('saved', '2026-10-24T09:59:50.000Z', null, null)).toMatchObject({
      text: 'Đã lưu bản nháp',
      time: null,
    });
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
    // "Quay về bản live" leaves a new revision with the live content: no "0 thay đổi".
    expect(
      liveStatusView(
        pageSummary({
          status: { kind: 'live_with_changes', changeCount: 0, changes: [] },
          liveRelease,
          latestVersion: 12,
        }),
      ),
    ).toEqual({ kind: 'live_with_changes', text: 'Live v12 · Nội dung giống bản live' });
    expect(
      liveStatusView(
        pageSummary({ status: { kind: 'live', changeCount: 0, changes: [] }, liveRelease }),
      ).text,
    ).toBe('Live v12');
    expect(
      liveStatusView(
        pageSummary({
          status: { kind: 'live', changeCount: 0, changes: [] },
          siteChanges: [siteChange],
          liveRelease,
        }),
      ).text,
    ).toBe('Live v12 · Giao diện site đã đổi');
    expect(liveStatusView(pageSummary()).text).toBe('Chưa xuất bản');
    expect(
      liveStatusView(pageSummary({ status: { kind: 'unpublished', changeCount: 0, changes: [] } }))
        .text,
    ).toBe('Đã gỡ');
  });

  it('words the site settings reminder of the draft notice (ADR-015)', () => {
    const live = { status: { kind: 'live' as const, changeCount: 0, changes: [] }, liveRelease };
    expect(siteChangesNotice(pageSummary(live))).toBeNull();
    expect(siteChangesNotice(pageSummary({ ...live, siteChanges: [siteChange] }))).toBe(
      'Giao diện site đã đổi sau khi xuất bản v12: trang live vẫn dùng giao diện cũ cho tới khi bạn xuất bản lại.',
    );
    // Nothing is live: nothing keeps an old look.
    expect(siteChangesNotice(pageSummary({ siteChanges: [siteChange] }))).toBeNull();
    expect(hasSiteChanges(pageSummary({ siteChanges: [siteChange] }))).toBe(true);
    expect(hasSiteChanges(pageSummary(live))).toBe(false);
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
        pageSummary({
          status: { kind: 'live_with_changes', changeCount: 3, changes: [] },
          liveRelease,
        }),
      ),
    ).toBe('Xuất bản thay đổi');
    // Nothing differs from live (no changes, or the draft was restored from live): no count.
    expect(
      publishButtonLabel(
        pageSummary({
          status: { kind: 'live_with_changes', changeCount: 0, changes: [] },
          liveRelease,
        }),
      ),
    ).toBe('Xuất bản');
    expect(
      publishButtonLabel(
        pageSummary({ status: { kind: 'live', changeCount: 0, changes: [] }, liveRelease }),
      ),
    ).toBe('Xuất bản');
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

  it('gives the editor controls on the frame the inverse zoom, so they keep their real size', () => {
    expect(frameStyle({ width: 1024, zoom: 0.5 })).toEqual({
      width: 1024,
      zoom: 0.5,
      '--chrome-zoom': 2,
    });
    expect(frameStyle({ width: null, zoom: 1 })).toEqual({
      width: '100%',
      zoom: 1,
      '--chrome-zoom': 1,
    });
  });
});
