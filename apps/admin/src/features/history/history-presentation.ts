import type { HistoryEntry, ReleaseSummary } from '@plp/contracts';
import type { BadgeTone } from '@plp/ui';
import { type DateInput, formatDate, formatDateTime, formatTime } from '../../lib/format';

/** Display copy for the version history (board 06). Pure functions, unit-tested. */

export type ReleaseEntry = Extract<HistoryEntry, { kind: 'release' }>;
export type PointerEntry = Extract<HistoryEntry, { kind: 'pointer' }>;

export interface PointerEntryView {
  /** "KHÔI PHỤC", "HOÀN TÁC", "ĐÃ GỠ". */
  badge: string;
  tone: BadgeTone;
  /** The version that became live ("v11"), or null when the page was unpublished. */
  title: string | null;
  /** "Chuyển trang live từ v12 sang v11", "Gỡ trang khỏi internet". */
  sentence: string;
}

function moveSentence(from: number | null, to: number | null): string {
  if (to === null) {
    return 'Gỡ trang khỏi internet';
  }
  if (from === null) {
    return `Đưa v${to} lên live`;
  }
  return `Chuyển trang live từ v${from} sang v${to}`;
}

/** A pointer move in the timeline: rollback, undone rollback or unpublish. */
export function pointerEntryView(entry: PointerEntry): PointerEntryView {
  const title = entry.toVersion === null ? null : `v${entry.toVersion}`;
  switch (entry.type) {
    case 'rolled_back':
      return {
        badge: 'KHÔI PHỤC',
        tone: 'warning',
        title,
        sentence: moveSentence(entry.fromVersion, entry.toVersion),
      };
    case 'rollback_undone':
      return {
        badge: 'HOÀN TÁC',
        tone: 'info',
        title,
        sentence: moveSentence(entry.fromVersion, entry.toVersion),
      };
    case 'unpublished':
      return { badge: 'ĐÃ GỠ', tone: 'muted', title: null, sentence: 'Gỡ trang khỏi internet' };
  }
}

/** "Ngọc Anh · 24/10/2026 15:02". */
export function byline(name: string, at: DateInput): string {
  return `${name} · ${formatDateTime(at)}`;
}

/** The changes of a release joined as on the board: "Sửa: Hero · SEO: mô tả". */
export function releaseChangesLine(release: Pick<ReleaseSummary, 'version' | 'changeSummary'>) {
  if (release.changeSummary.length > 0) {
    return release.changeSummary.map((change) => change.label).join(' · ');
  }
  return release.version === 1 ? 'Phiên bản đầu tiên' : 'Không có thay đổi so với bản trước';
}

/** Number of release entries among the loaded history entries. */
export function loadedReleaseCount(items: readonly HistoryEntry[]): number {
  return items.filter((entry) => entry.kind === 'release').length;
}

/** "Xem thêm 8 phiên bản cũ hơn" (older pointer moves only: "Xem thêm lịch sử cũ hơn"). */
export function olderEntriesLabel(releaseCount: number, loadedReleases: number): string {
  const remaining = releaseCount - loadedReleases;
  return remaining > 0 ? `Xem thêm ${remaining} phiên bản cũ hơn` : 'Xem thêm lịch sử cũ hơn';
}

/**
 * The rollback the "v11 đang live" banner describes: the newest entry, while it is a rollback.
 * A later publish, undo or unpublish replaces it.
 */
export function latestRollback(items: readonly HistoryEntry[]): PointerEntry | null {
  const newest = items[0];
  return newest?.kind === 'pointer' && newest.type === 'rolled_back' ? newest : null;
}

/** "17:20" for a time today, otherwise "22/10/2026 17:20". */
export function timeOfDayLabel(at: DateInput, now: DateInput): string {
  return formatDate(at) === formatDate(now) ? formatTime(at) : formatDateTime(at);
}

/** The release a "?restore=" link or "Khôi phục bản này" points at, unless it is live already. */
export function restorableRelease(
  items: readonly HistoryEntry[],
  releaseId: string | null,
  liveReleaseId: string | null,
): ReleaseSummary | null {
  if (releaseId === null || releaseId === liveReleaseId) {
    return null;
  }
  for (const entry of items) {
    if (entry.kind === 'release' && entry.release.id === releaseId) {
      return entry.release;
    }
  }
  return null;
}

/** Key of a history entry in a list. */
export function entryKey(entry: HistoryEntry): string {
  return entry.kind === 'release' ? `release-${entry.release.id}` : `pointer-${entry.activityId}`;
}
