import {
  type AutomationListItem,
  type AutomationTrigger,
  type AutomationUsage,
  opportunityStageLabels,
} from '@plp/contracts';
import type { BadgeTone } from '@plp/ui';
import { formatCount, formatDayMonth, formatRelativeTime } from '../../lib/format';

function minutesLabel(minutes: number): string {
  if (minutes % 1440 === 0) {
    return `${minutes / 1440} ngày`;
  }
  if (minutes % 60 === 0) {
    return `${minutes / 60} giờ`;
  }
  return `${minutes} phút`;
}

/** "KHI NÀO CHẠY" of board 25. */
export function triggerLabel(trigger: AutomationTrigger): string {
  switch (trigger.kind) {
    case 'lead_created':
      return trigger.pageIds.length === 0
        ? 'Có lead mới'
        : `Có lead mới · ${trigger.pageIds.length} trang`;
    case 'lead_still_new':
      return `Lead còn “Mới” sau ${minutesLabel(trigger.minutes)}`;
    case 'opportunity_stage_changed':
      return trigger.stage === null
        ? 'Cơ hội đổi giai đoạn'
        : `Cơ hội chuyển sang ${opportunityStageLabels[trigger.stage]}`;
    case 'task_overdue':
      return 'Công việc quá hạn';
  }
}

/** "Đang bật", "Cần xử lý" when its last run failed, "Tạm dừng", "Tự tạm dừng", "Bản nháp". */
export function stateBadge(item: AutomationListItem): { label: string; tone: BadgeTone } {
  switch (item.state) {
    case 'draft':
      return { label: 'Bản nháp', tone: 'neutral' };
    case 'paused':
      return item.pausedReason === 'errors'
        ? { label: 'Tự tạm dừng', tone: 'danger' }
        : { label: 'Tạm dừng', tone: 'neutral' };
    case 'on':
      return item.lastRun?.status === 'failed'
        ? { label: 'Cần xử lý', tone: 'danger' }
        : { label: 'Đang bật', tone: 'success' };
  }
}

const RUN_WORDS: Record<NonNullable<AutomationListItem['lastRun']>['status'], string> = {
  scheduled: 'Đang chờ',
  queued: 'Đang chờ',
  running: 'Đang chạy',
  waiting_retry: 'Đang thử lại',
  succeeded: 'Thành công',
  failed: 'Thất bại',
  skipped: 'Bỏ qua',
  stopped: 'Đã dừng',
};

/** "Thành công · 5 phút trước", "Chưa chạy". */
export function lastRunLabel(item: AutomationListItem, now: number): string {
  if (item.lastRun === null) {
    return 'Chưa chạy';
  }
  return `${RUN_WORDS[item.lastRun.status]} · ${formatRelativeTime(item.lastRun.at, now)}`;
}

/** "412 lượt · 0 lỗi", or "—" for one that never ran. */
export function last30DaysLabel(item: AutomationListItem): string {
  if (item.lastRun === null && item.last30Days.runs === 0) {
    return '—';
  }
  return `${formatCount(item.last30Days.runs)} lượt · ${formatCount(item.last30Days.failed)} lỗi`;
}

/** "1.240 lượt chạy tháng này · hạn mức 2.000". */
export function usageLine(usage: AutomationUsage): string {
  return `${formatCount(usage.used)} lượt chạy tháng này · hạn mức ${formatCount(usage.limit)}`;
}

/** The quota ran out (ADR-034): new events wait for the month after. */
export function quotaNotice(usage: AutomationUsage): string | null {
  return usage.used < usage.limit
    ? null
    : `Đã dùng hết ${formatCount(usage.limit)} lượt tháng này. Automation chạy lại từ ${formatDayMonth(`${usage.resetsOn}T12:00:00.000Z`)}.`;
}

/** "Ngọc Anh · 14/10" under the name. */
export function createdLine(item: AutomationListItem): string {
  const day = formatDayMonth(item.createdAt);
  return item.createdBy === null ? day : `${item.createdBy.name} · ${day}`;
}
