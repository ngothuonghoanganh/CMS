import type { PageStatusKind, PageSummary, PointerEvent } from '@plp/contracts';
import { type DateInput, formatDayMonth, formatRelativeTime } from '../../lib/format';

export type ChecksTone = 'danger' | 'warning' | 'success' | 'muted';

/** What the dashboard shows for one page; every string comes from the server's page summary. */
export interface PageStatusPresentation {
  /** Status for `StatusBadge` ("Live", "Live · Có thay đổi", "Bản nháp", "Đã gỡ"). */
  badge: PageStatusKind;
  /** Line under the badge, e.g. "4 thay đổi chưa xuất bản". */
  subtext: string;
  /** "PHIÊN BẢN LIVE" column, e.g. "v12 · 2 giờ trước". */
  versionLine: string;
  /** Line under the version, e.g. "bởi Ngọc Anh"; null when the server did not say who. */
  authorLine: string | null;
  /** "KIỂM TRA" column. */
  checks: { label: string; tone: ChecksTone };
}

function isRestore(event: PointerEvent | null): boolean {
  return event?.type === 'rolled_back' || event?.type === 'rollback_undone';
}

function subtextOf(page: PageSummary): string {
  const event = page.lastPointerEvent;
  switch (page.status.kind) {
    case 'live_with_changes':
      return `${page.status.changeCount} thay đổi chưa xuất bản`;
    case 'live': {
      if (isRestore(event)) {
        const version = event?.version ?? page.liveRelease?.version;
        return version === undefined ? 'Đã khôi phục' : `Đã khôi phục về v${version}`;
      }
      return 'Bản nháp trùng bản live';
    }
    case 'draft':
      return 'Chưa từng xuất bản';
    case 'unpublished':
      return event?.type === 'unpublished'
        ? `Gỡ ngày ${formatDayMonth(event.at)}`
        : 'Đã gỡ khỏi internet';
  }
}

function versionOf(
  page: PageSummary,
  now: DateInput,
): Pick<PageStatusPresentation, 'versionLine' | 'authorLine'> {
  const event = page.lastPointerEvent;
  if (page.status.kind === 'draft') {
    return { versionLine: '—', authorLine: `tạo bởi ${page.createdBy.name}` };
  }
  if (page.status.kind === 'unpublished') {
    return {
      versionLine: `v${page.latestVersion} (đã gỡ)`,
      authorLine: event ? `bởi ${event.by.name}` : null,
    };
  }
  const live = page.liveRelease;
  if (live === null) {
    return { versionLine: '—', authorLine: null };
  }
  // The version went live at the last pointer move: a publish, a rollback or an undo.
  const wentLiveAt = event && event.type !== 'unpublished' ? event.at : live.publishedAt;
  const versionLine = `v${live.version} · ${formatRelativeTime(wentLiveAt, now)}`;
  if (event === null) {
    return { versionLine, authorLine: null };
  }
  return {
    versionLine,
    authorLine: isRestore(event) ? `khôi phục bởi ${event.by.name}` : `bởi ${event.by.name}`,
  };
}

function checksOf(page: PageSummary): PageStatusPresentation['checks'] {
  const { blocking, warnings } = page.checks;
  if (blocking > 0) {
    return { label: `${blocking} lỗi chặn`, tone: 'danger' };
  }
  if (warnings > 0) {
    return { label: `${warnings} cảnh báo`, tone: 'warning' };
  }
  if (page.status.kind === 'unpublished') {
    return { label: '—', tone: 'muted' };
  }
  return { label: 'Sẵn sàng', tone: 'success' };
}

/** Maps a page summary to the dashboard row: badge, subtext, live version and checks. */
export function presentPageStatus(page: PageSummary, now: DateInput): PageStatusPresentation {
  return {
    badge: page.status.kind,
    subtext: subtextOf(page),
    ...versionOf(page, now),
    checks: checksOf(page),
  };
}

/** True while a release of the page is live, i.e. it can be unpublished or opened. */
export function isPageLive(page: PageSummary): boolean {
  return page.liveRelease !== null;
}
