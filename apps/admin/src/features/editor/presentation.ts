import type { ChecksResult, PageStatusKind, PageSummary } from '@plp/contracts';
import type { CSSProperties } from 'react';
import { formatRelativeTime } from '../../lib/format';
import type { Device, SaveFailure, SaveState, VisibilityGroup } from './store';

/** Display copy for editor states. Pure functions, unit-tested. */

export const deviceLabels: Record<Device, string> = {
  desktop: 'Máy tính',
  tablet: 'Máy tính bảng',
  mobile: 'Điện thoại',
};

export const canvasLabels: Record<Device, string> = {
  desktop: 'Bản nháp · Máy tính',
  tablet: 'Bản nháp · Máy tính bảng (768 px)',
  mobile: 'Bản nháp · Điện thoại (390 px)',
};

/** Layout widths of the preview frame. The desktop frame fills the canvas from 1024 to 1280 px. */
export const DESKTOP_MIN_WIDTH = 1024;
export const DESKTOP_MAX_WIDTH = 1280;
const fixedWidths: Record<Exclude<Device, 'desktop'>, number> = { tablet: 768, mobile: 390 };

export interface FrameLayout {
  /** Width the page is laid out at (container queries see this width); null fills the canvas. */
  width: number | null;
  /** Visual scale when the canvas is narrower than the layout width. */
  zoom: number;
}

/**
 * The preview frame for a device in a canvas of `available` pixels. The page is laid out at a
 * real device width and scaled down to fit, so a narrow window still previews the desktop layout.
 */
export function frameLayout(device: Device, available: number | null): FrameLayout {
  const target = device === 'desktop' ? DESKTOP_MIN_WIDTH : fixedWidths[device];
  if (available === null || available <= 0) {
    return { width: device === 'desktop' ? null : target, zoom: 1 };
  }
  if (available < target) {
    return { width: target, zoom: Math.floor((available / target) * 100) / 100 };
  }
  if (device === 'desktop') {
    return { width: Math.min(available, DESKTOP_MAX_WIDTH), zoom: 1 };
  }
  return { width: target, zoom: 1 };
}

/**
 * Style of the canvas frame. The page inside is scaled with `zoom`; the editor's own controls on
 * it (section toolbar, insertion point, alt warning) read `--chrome-zoom` to undo that scaling,
 * so their targets keep their real size (WCAG 2.5.8) on a narrow canvas.
 */
export function frameStyle(layout: FrameLayout): CSSProperties & { '--chrome-zoom': number } {
  return { width: layout.width ?? '100%', zoom: layout.zoom, '--chrome-zoom': 1 / layout.zoom };
}

export const groupLabels: Record<VisibilityGroup, string> = {
  desktop: 'máy tính',
  mobile: 'điện thoại',
};

export interface SaveStatusView {
  tone: 'success' | 'muted' | 'danger' | 'warning';
  /** The save state ("Đã lưu bản nháp"); it changes only when the state does. */
  text: string;
  /**
   * When the draft was last saved ("2 phút trước"). It changes as time passes, so it stays out of
   * the status live region; otherwise screen readers would hear the status again every minute.
   */
  time: string | null;
  /** Show the "Thử lại" button. */
  canRetry: boolean;
}

/** `now` is null while server rendering; the relative time is then left out. */
export function saveStatusView(
  saveState: SaveState,
  lastSavedAt: string | null,
  saveError: SaveFailure | null,
  now: Date | null,
): SaveStatusView {
  switch (saveState) {
    case 'saved':
      return {
        tone: 'success',
        text: 'Đã lưu bản nháp',
        time: lastSavedAt === null || now === null ? null : formatRelativeTime(lastSavedAt, now),
        canRetry: false,
      };
    case 'saving':
      return { tone: 'muted', text: 'Đang lưu…', time: null, canRetry: false };
    case 'dirty':
      return { tone: 'muted', text: 'Có thay đổi chưa lưu', time: null, canRetry: false };
    case 'conflict':
      return {
        tone: 'danger',
        text: 'Trang vừa được cập nhật ở nơi khác',
        time: null,
        canRetry: false,
      };
    case 'error':
      // A rejected draft (422) needs a fix, not another attempt.
      return {
        tone: 'danger',
        text: 'Chưa lưu được',
        time: null,
        canRetry: saveError?.kind !== 'invalid',
      };
  }
}

/** Subtext of a live page whose draft has a new revision but the same content as live. */
export const SAME_AS_LIVE = 'Nội dung giống bản live';

/**
 * The site settings changed after the live release was published (`siteChanges`): the live page
 * keeps the look (ADR-015) and, with a form, the consent settings (ADR-017) it was published with
 * until it is published again.
 */
export const SITE_CHANGED = 'Giao diện site đã đổi';
const PRIVACY_CHANGED = 'Dữ liệu cá nhân đã đổi';
const SETTINGS_CHANGED = 'Cài đặt site đã đổi';

export function hasSiteChanges(page: Pick<PageSummary, 'siteChanges'>): boolean {
  return page.siteChanges.length > 0;
}

interface SiteChangeWording {
  /** "Giao diện site đã đổi" */
  label: string;
  /** What the live page keeps: "giao diện" in "vẫn dùng giao diện cũ". */
  kept: string;
}

function siteChangeWording(page: Pick<PageSummary, 'siteChanges'>): SiteChangeWording {
  const look = page.siteChanges.some((change) => change.kind === 'site');
  const privacy = page.siteChanges.some((change) => change.kind === 'privacy');
  if (look && privacy) {
    return { label: SETTINGS_CHANGED, kept: 'cài đặt' };
  }
  return privacy
    ? { label: PRIVACY_CHANGED, kept: 'nội dung đồng ý' }
    : { label: SITE_CHANGED, kept: 'giao diện' };
}

/** Which settings changed: the look, the personal data and consent settings, or both. */
export function siteChangedLabel(page: Pick<PageSummary, 'siteChanges'>): string {
  return siteChangeWording(page).label;
}

/** Dashboard subtext of a live page whose site settings changed since it was published. */
export function siteChangedReminder(page: Pick<PageSummary, 'siteChanges'>): string {
  return `${siteChangedLabel(page)} · xuất bản lại để áp dụng`;
}

/**
 * How much the next publish changes on the live page: the draft's changes plus the site settings
 * it applies (ADR-015, ADR-017). The top bar badge and the publish dialog title both count this.
 */
export function pendingChangeCount(page: Pick<PageSummary, 'status' | 'siteChanges'>): number {
  return page.status.kind === 'draft' ? 0 : page.status.changeCount + page.siteChanges.length;
}

/** Status line text of a live page whose content equals live: the site settings may differ. */
function sameContentText(page: Pick<PageSummary, 'siteChanges'>): string {
  return hasSiteChanges(page) ? siteChangedLabel(page) : SAME_AS_LIVE;
}

/**
 * The editor's draft notice adds this while the live page shows older site settings; null when
 * it shows the current ones (or nothing is live).
 */
export function siteChangesNotice(page: Pick<PageSummary, 'siteChanges' | 'liveRelease'>) {
  if (!hasSiteChanges(page) || page.liveRelease === null) {
    return null;
  }
  const { label, kept } = siteChangeWording(page);
  return `${label} sau khi xuất bản v${page.liveRelease.version}: trang live vẫn dùng ${kept} cũ cho tới khi bạn xuất bản lại.`;
}

export interface LiveStatusView {
  kind: PageStatusKind;
  text: string;
}

export function liveStatusView(page: PageSummary): LiveStatusView {
  const version = page.liveRelease?.version ?? page.latestVersion;
  switch (page.status.kind) {
    case 'live_with_changes':
      return {
        kind: 'live_with_changes',
        // After "Quay về bản live" the revision differs but the content equals the live release.
        text:
          page.status.changeCount === 0
            ? `Live v${version} · ${sameContentText(page)}`
            : `Live v${version} · ${page.status.changeCount} thay đổi chưa xuất bản`,
      };
    case 'live':
      return {
        kind: 'live',
        text: hasSiteChanges(page)
          ? `Live v${version} · ${siteChangedLabel(page)}`
          : `Live v${version}`,
      };
    case 'draft':
      return { kind: 'draft', text: 'Chưa xuất bản' };
    case 'unpublished':
      return { kind: 'unpublished', text: 'Đã gỡ' };
  }
}

export interface ChecksSummaryView {
  tone: 'danger' | 'warning' | 'success';
  text: string;
}

export function checksSummaryView(checks: ChecksResult): ChecksSummaryView {
  const blocking = checks.blocking.length;
  const warnings = checks.warnings.length;
  if (blocking === 0 && warnings === 0) {
    return { tone: 'success', text: 'Sẵn sàng xuất bản' };
  }
  const parts = [
    blocking > 0 ? `${blocking} lỗi` : null,
    warnings > 0 ? `${warnings} cảnh báo` : null,
  ].filter((part): part is string => part !== null);
  return { tone: blocking > 0 ? 'danger' : 'warning', text: parts.join(' · ') };
}

/** "Xuất bản thay đổi" (with the count beside it) only when there are changes to publish. */
export function publishButtonLabel(page: PageSummary): string {
  return pendingChangeCount(page) === 0 ? 'Xuất bản' : 'Xuất bản thay đổi';
}

/** "https://go.smilecare.vn/uu-dai/" → "go.smilecare.vn/uu-dai". */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

/** Live path of a page for link resolution on the canvas: "/" or "/uu-dai", null when not live. */
export function livePathOf(page: Pick<PageSummary, 'liveRelease'>): string | null {
  if (page.liveRelease === null) {
    return null;
  }
  return page.liveRelease.slug === '' ? '/' : `/${page.liveRelease.slug}`;
}

/** Lowercases the first letter of an item label for running text: "Lợi ích" → "lợi ích". */
export function lowerFirst(text: string): string {
  return text.charAt(0).toLocaleLowerCase('vi') + text.slice(1);
}
