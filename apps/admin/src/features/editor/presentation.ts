import type { ChecksResult, PageStatusKind, PageSummary } from '@plp/contracts';
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

export const groupLabels: Record<VisibilityGroup, string> = {
  desktop: 'máy tính',
  mobile: 'điện thoại',
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** "vừa xong", "5 phút trước", "2 giờ trước", then "24/10/2026". */
export function relativeTime(iso: string, now: Date): string {
  const then = new Date(iso);
  const elapsed = Math.max(0, now.getTime() - then.getTime());
  if (elapsed < MINUTE) {
    return 'vừa xong';
  }
  if (elapsed < HOUR) {
    return `${Math.floor(elapsed / MINUTE)} phút trước`;
  }
  if (elapsed < 24 * HOUR) {
    return `${Math.floor(elapsed / HOUR)} giờ trước`;
  }
  return `${pad(then.getDate())}/${pad(then.getMonth() + 1)}/${then.getFullYear()}`;
}

export interface SaveStatusView {
  tone: 'success' | 'muted' | 'danger' | 'warning';
  text: string;
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
        text:
          lastSavedAt === null || now === null
            ? 'Đã lưu bản nháp'
            : `Đã lưu bản nháp · ${relativeTime(lastSavedAt, now)}`,
        canRetry: false,
      };
    case 'saving':
      return { tone: 'muted', text: 'Đang lưu…', canRetry: false };
    case 'dirty':
      return { tone: 'muted', text: 'Có thay đổi chưa lưu', canRetry: false };
    case 'conflict':
      return { tone: 'danger', text: 'Trang vừa được cập nhật ở nơi khác', canRetry: false };
    case 'error':
      // A rejected draft (422) needs a fix, not another attempt.
      return { tone: 'danger', text: 'Chưa lưu được', canRetry: saveError?.kind !== 'invalid' };
  }
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
        text: `Live v${version} · ${page.status.changeCount} thay đổi chưa xuất bản`,
      };
    case 'live':
      return { kind: 'live', text: `Live v${version}` };
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

export function publishButtonLabel(page: PageSummary): string {
  return page.status.kind === 'draft' ? 'Xuất bản' : 'Xuất bản thay đổi';
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
