import type {
  ChangeItem,
  ChecksResult,
  LiveReleaseRef,
  PageSummary,
  PublishResponse,
} from '@plp/contracts';

/**
 * State of one session of the publish dialog (screen 05), as a pure reducer so the rules
 * (acknowledged warnings, disabled reasons, first-publish copy) are unit-tested.
 */

/** What the dialog reviews: the saved draft revision, the page summary and fresh checks. */
export interface PreparedPublish {
  revision: number;
  page: PageSummary;
  checks: ChecksResult;
  /** When the review data arrived (epoch ms), for "v12 · 2 giờ trước". */
  loadedAt: number;
}

/** A message above the checks after something changed under the dialog (409, 422). */
export interface PublishNotice {
  title: string;
  message: string;
}

export interface PublishedResult {
  response: PublishResponse;
  /** The release that was live before this publish, for "Có vấn đề? Khôi phục v12". */
  previousLive: LiveReleaseRef | null;
  /** QR code of the live URL as a data URL; null when it could not be drawn. */
  qrCode: string | null;
}

export type PublishPhase =
  /** Saving pending changes and loading the checks. */
  | 'preparing'
  /** Preparing failed; the user can try again. */
  | 'failed'
  /** The draft was saved elsewhere since the editor loaded it: reload before publishing. */
  | 'stale'
  | 'review'
  | 'published';

export interface PublishState {
  phase: PublishPhase;
  prepared: PreparedPublish | null;
  /** Fingerprints of the warnings skipped for this publish ("Bỏ qua lần này"). */
  acknowledged: readonly string[];
  note: string;
  submitting: boolean;
  notice: PublishNotice | null;
  /** Actionable error of the last attempt (preparing or publishing). */
  error: string | null;
  published: PublishedResult | null;
}

export type PublishAction =
  | { type: 'prepare_started'; notice?: PublishNotice | null }
  | { type: 'prepared'; prepared: PreparedPublish }
  | { type: 'prepare_failed'; message: string }
  | { type: 'stale' }
  | { type: 'warning_toggled'; fingerprint: string }
  | { type: 'note_changed'; note: string }
  | { type: 'submit_started' }
  | { type: 'submit_failed'; message: string }
  | { type: 'checks_refreshed'; checks: ChecksResult; notice: PublishNotice }
  | { type: 'published'; result: PublishedResult };

export const initialPublishState: PublishState = {
  phase: 'preparing',
  prepared: null,
  acknowledged: [],
  note: '',
  submitting: false,
  notice: null,
  error: null,
  published: null,
};

/** Keeps only acknowledgements of warnings that still exist. */
export function currentAcknowledgements(
  checks: ChecksResult,
  acknowledged: readonly string[],
): string[] {
  const fingerprints = new Set(checks.warnings.map((warning) => warning.fingerprint));
  return acknowledged.filter((fingerprint) => fingerprints.has(fingerprint));
}

export function publishReducer(state: PublishState, action: PublishAction): PublishState {
  switch (action.type) {
    case 'prepare_started':
      return {
        ...state,
        phase: 'preparing',
        submitting: false,
        error: null,
        notice: action.notice ?? state.notice,
      };
    case 'prepared':
      return {
        ...state,
        phase: 'review',
        prepared: action.prepared,
        acknowledged: currentAcknowledgements(action.prepared.checks, state.acknowledged),
        error: null,
      };
    case 'prepare_failed':
      return { ...state, phase: 'failed', submitting: false, error: action.message };
    case 'stale':
      return { ...state, phase: 'stale', submitting: false, error: null };
    case 'warning_toggled': {
      if (state.phase !== 'review' || state.submitting) {
        return state;
      }
      const acknowledged = state.acknowledged.includes(action.fingerprint)
        ? state.acknowledged.filter((fingerprint) => fingerprint !== action.fingerprint)
        : [...state.acknowledged, action.fingerprint];
      return { ...state, acknowledged };
    }
    case 'note_changed':
      return state.submitting ? state : { ...state, note: action.note };
    case 'submit_started':
      return state.phase === 'review' ? { ...state, submitting: true, error: null } : state;
    case 'submit_failed':
      return { ...state, submitting: false, error: action.message };
    case 'checks_refreshed': {
      if (state.prepared === null) {
        return state;
      }
      return {
        ...state,
        phase: 'review',
        submitting: false,
        prepared: { ...state.prepared, checks: action.checks },
        acknowledged: currentAcknowledgements(action.checks, state.acknowledged),
        notice: action.notice,
      };
    }
    case 'published':
      return {
        ...state,
        phase: 'published',
        submitting: false,
        error: null,
        notice: null,
        published: action.result,
      };
  }
}

/** Never published before: no live version to compare with, no version to restore. */
export function isFirstPublish(page: PageSummary): boolean {
  return page.latestVersion === 0;
}

/**
 * The chips of the dialog: the draft's changes, then the site settings this publish applies to
 * the live page ("Giao diện site: logo", ADR-015).
 */
export function publishChanges(page: PageSummary): ChangeItem[] {
  return [...page.status.changes, ...page.siteChanges];
}

/** Dialog title: "Xuất bản 4 thay đổi", or "Xuất bản trang" for a first publish. */
export function publishTitle(page: PageSummary): string {
  if (isFirstPublish(page)) {
    return 'Xuất bản trang';
  }
  const count = page.status.changeCount + page.siteChanges.length;
  if (page.liveRelease === null || count === 0) {
    return 'Xuất bản lại trang';
  }
  return `Xuất bản ${count} thay đổi`;
}

/** The version this publish creates. */
export function nextVersion(page: PageSummary): number {
  return page.latestVersion + 1;
}

/** Footer note: what stays safe after publishing. */
export function publishFooterNote(page: PageSummary): string {
  if (isFirstPublish(page)) {
    return 'Sau khi xuất bản, trang sẽ có địa chỉ công khai.';
  }
  const kept = page.liveRelease?.version ?? page.latestVersion;
  return `Bản v${kept} vẫn được lưu. Bạn có thể khôi phục bất cứ lúc nào trong Lịch sử phiên bản.`;
}

export interface ChecksTally {
  blocking: number;
  /** Warnings neither fixed nor skipped. */
  openWarnings: number;
  ignored: number;
  passed: number;
}

export function tallyChecks(checks: ChecksResult, acknowledged: readonly string[]): ChecksTally {
  const ignored = currentAcknowledgements(checks, acknowledged).length;
  return {
    blocking: checks.blocking.length,
    openWarnings: checks.warnings.length - ignored,
    ignored,
    passed: checks.passed.length,
  };
}

/** "1 lỗi chặn · 2 cảnh báo · 1 đã bỏ qua · 9 đạt". */
export function checksSummaryLine(tally: ChecksTally): string {
  const parts: string[] = [];
  if (tally.blocking > 0) {
    parts.push(`${tally.blocking} lỗi chặn`);
  }
  if (tally.openWarnings > 0) {
    parts.push(`${tally.openWarnings} cảnh báo`);
  }
  if (tally.ignored > 0) {
    parts.push(`${tally.ignored} đã bỏ qua`);
  }
  if (tally.blocking === 0 && tally.openWarnings === 0 && tally.ignored === 0) {
    parts.push('Không có lỗi hay cảnh báo');
  }
  if (tally.passed > 0) {
    parts.push(`${tally.passed} đạt`);
  }
  return parts.join(' · ');
}

/**
 * Why "Xuất bản" is disabled, linked to the button with `aria-describedby`; null when publishing
 * is allowed. Blocking errors must be fixed; each warning must be fixed or skipped (ADR-006).
 */
export function publishDisabledReason(tally: ChecksTally): string | null {
  if (tally.blocking > 0) {
    return `Sửa ${tally.blocking} lỗi để xuất bản`;
  }
  if (tally.openWarnings > 0) {
    return `Sửa hoặc bỏ qua ${tally.openWarnings} cảnh báo`;
  }
  return null;
}

/** When the live version went live: its pointer move (publish, rollback, undo) or its release. */
export function liveSince(page: PageSummary): string | null {
  const live = page.liveRelease;
  if (live === null) {
    return null;
  }
  const event = page.lastPointerEvent;
  if (event !== null && event.type !== 'unpublished' && event.version === live.version) {
    return event.at;
  }
  return live.publishedAt;
}
