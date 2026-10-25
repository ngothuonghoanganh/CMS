import { describe, expect, it } from 'vitest';
import { presentPageStatus } from './status-presentation';
import { draftPageFixture, minh, pageFixture, pointerEvent } from './test-fixtures';

// 24/10/2026 15:02 in Vietnam; the fixtures went live two hours earlier.
const now = new Date('2026-10-24T08:02:00.000Z');

describe('presentPageStatus', () => {
  it('describes a live page whose draft equals the live release', () => {
    expect(presentPageStatus(pageFixture(), now)).toEqual({
      badge: 'live',
      subtext: 'Bản nháp trùng bản live',
      versionLine: 'v12 · 2 giờ trước',
      authorLine: 'bởi Ngọc Anh',
      checks: { label: 'Sẵn sàng', tone: 'success' },
    });
  });

  it('counts unpublished changes for a live page with changes', () => {
    const page = pageFixture({
      status: { kind: 'live_with_changes', changeCount: 4, changes: [] },
      checks: { blocking: 1, warnings: 2 },
    });
    expect(presentPageStatus(page, now)).toMatchObject({
      badge: 'live_with_changes',
      subtext: '4 thay đổi chưa xuất bản',
      versionLine: 'v12 · 2 giờ trước',
      checks: { label: '1 lỗi chặn', tone: 'danger' },
    });
  });

  it('says the content equals live when a restored draft has no changes', () => {
    const page = pageFixture({
      status: { kind: 'live_with_changes', changeCount: 0, changes: [] },
    });
    expect(presentPageStatus(page, now)).toMatchObject({
      badge: 'live_with_changes',
      subtext: 'Nội dung giống bản live',
    });
  });

  it('says the live version was restored after a rollback, with who restored it and when', () => {
    const page = pageFixture({
      liveRelease: {
        id: '64b000000000000000000205',
        version: 5,
        slug: 'implant',
        publishedAt: '2026-09-01T03:00:00.000Z',
      },
      lastPointerEvent: pointerEvent({
        type: 'rolled_back',
        version: 5,
        by: minh,
        at: '2026-10-23T09:20:00.000Z',
      }),
      checks: { blocking: 0, warnings: 2 },
    });
    expect(presentPageStatus(page, now)).toEqual({
      badge: 'live',
      subtext: 'Đã khôi phục về v5',
      versionLine: 'v5 · hôm qua, 16:20',
      authorLine: 'khôi phục bởi Minh',
      checks: { label: '2 cảnh báo', tone: 'warning' },
    });
  });

  it('treats an undone rollback as a restore too', () => {
    const page = pageFixture({
      lastPointerEvent: pointerEvent({ type: 'rollback_undone', version: 12, by: minh }),
    });
    expect(presentPageStatus(page, now)).toMatchObject({
      subtext: 'Đã khôi phục về v12',
      authorLine: 'khôi phục bởi Minh',
    });
  });

  it('says which version was restored after a rollback, while the draft is ahead (§2.1.8)', () => {
    const page = pageFixture({
      status: { kind: 'live_with_changes', changeCount: 1, changes: [] },
      lastPointerEvent: pointerEvent({ type: 'rolled_back', version: 11, by: minh }),
    });
    expect(presentPageStatus(page, now)).toMatchObject({
      badge: 'live_with_changes',
      subtext: 'Đã khôi phục về v11',
      authorLine: 'khôi phục bởi Minh',
    });
  });

  it('counts the changes again once a rollback is undone', () => {
    const page = pageFixture({
      status: { kind: 'live_with_changes', changeCount: 2, changes: [] },
      lastPointerEvent: pointerEvent({ type: 'rollback_undone', version: 12, by: minh }),
    });
    expect(presentPageStatus(page, now)).toMatchObject({
      badge: 'live_with_changes',
      subtext: '2 thay đổi chưa xuất bản',
    });
  });

  it('falls back to the release time and no author when no pointer event is known', () => {
    const page = pageFixture({ lastPointerEvent: null });
    expect(presentPageStatus(page, now)).toMatchObject({
      versionLine: 'v12 · 2 giờ trước',
      authorLine: null,
    });
  });

  it('shows who created a draft that was never published', () => {
    expect(
      presentPageStatus(draftPageFixture({ checks: { blocking: 0, warnings: 3 } }), now),
    ).toEqual({
      badge: 'draft',
      subtext: 'Chưa từng xuất bản',
      versionLine: '—',
      authorLine: 'tạo bởi Minh',
      checks: { label: '3 cảnh báo', tone: 'warning' },
    });
  });

  it('shows the latest version and the unpublish date of an unpublished page', () => {
    const page = pageFixture({
      status: { kind: 'unpublished', changeCount: 0, changes: [] },
      liveRelease: null,
      latestVersion: 3,
      liveUrl: null,
      lastPointerEvent: pointerEvent({
        type: 'unpublished',
        version: null,
        at: '2026-10-01T03:00:00.000Z',
      }),
    });
    expect(presentPageStatus(page, now)).toEqual({
      badge: 'unpublished',
      subtext: 'Gỡ ngày 01/10',
      versionLine: 'v3 (đã gỡ)',
      authorLine: 'bởi Ngọc Anh',
      checks: { label: '—', tone: 'muted' },
    });
  });

  it('still reports pending problems of an unpublished page', () => {
    const page = pageFixture({
      status: { kind: 'unpublished', changeCount: 0, changes: [] },
      liveRelease: null,
      lastPointerEvent: null,
      checks: { blocking: 2, warnings: 0 },
    });
    expect(presentPageStatus(page, now)).toMatchObject({
      subtext: 'Đã gỡ khỏi internet',
      authorLine: null,
      checks: { label: '2 lỗi chặn', tone: 'danger' },
    });
  });

  it('shows a dash for a live status without a live release', () => {
    const page = pageFixture({ liveRelease: null });
    expect(presentPageStatus(page, now)).toMatchObject({ versionLine: '—', authorLine: null });
  });
});
