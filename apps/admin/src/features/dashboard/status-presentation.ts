import type { PageStatusKind, PageSummary, PointerEvent } from '@plp/contracts';
import { type DateInput, formatDayMonth, formatRelativeTime } from '../../lib/format';
import { hasSiteChanges, SAME_AS_LIVE, SITE_CHANGED_REMINDER } from '../editor/presentation';

export type ChecksTone = 'danger' | 'warning' | 'success' | 'muted';

/** What the dashboard shows for one page; every string comes from the server's page summary. */
export interface PageStatusPresentation {
  /** Status for `StatusBadge` ("Live", "Live · Có thay đổi", "Bản nháp", "Đã gỡ"). */
  badge: PageStatusKind;
  /**
   * Line under the badge, e.g. "4 thay đổi chưa xuất bản", or for a live page whose site settings
   * changed since it was published, "Giao diện site đã đổi · xuất bản lại để áp dụng".
   */
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

function restoredLine(page: PageSummary): string {
  const version = page.lastPointerEvent?.version ?? page.liveRelease?.version;
  return version === undefined ? 'Đã khôi phục' : `Đã khôi phục về v${version}`;
}

function subtextOf(page: PageSummary): string {
  const event = page.lastPointerEvent;
  switch (page.status.kind) {
    case 'live_with_changes':
      // A rollback leaves the draft ahead of the restored release, so the page is "Có thay đổi"
      // (rule 2); the line says which version was restored (ARCHITECTURE §2.1.8).
      if (event?.type === 'rolled_back') {
        return restoredLine(page);
      }
      // After "Quay về bản live" the revision differs (rule 2) but nothing changed in content;
      // a publish would then only apply the site's new look, if any (ADR-015).
      if (page.status.changeCount === 0) {
        return hasSiteChanges(page) ? SITE_CHANGED_REMINDER : SAME_AS_LIVE;
      }
      return `${page.status.changeCount} thay đổi chưa xuất bản`;
    case 'live':
      // The only thing a publish would change is the site's look (ADR-015): say so first.
      if (hasSiteChanges(page)) {
        return SITE_CHANGED_REMINDER;
      }
      return isRestore(event) ? restoredLine(page) : 'Bản nháp trùng bản live';
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
