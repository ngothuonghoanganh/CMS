import type {
  AutomationListItem,
  AutomationRunDetail,
  AutomationRunFilter,
  AutomationRunItem,
  AutomationRunStatus,
  AutomationRunStep,
} from '@plp/contracts';
import { formatDate, formatDayMonth, formatTime } from '../../lib/format';
import { actionTitle, webhookHost } from './automation-steps';

const DAY_MS = 86_400_000;

export type RunTone = 'success' | 'danger' | 'warning' | 'primary' | 'neutral';

/** Board 27's words and colours for a run. */
export const runStatusLabels: Record<AutomationRunStatus, { label: string; tone: RunTone }> = {
  scheduled: { label: 'Đang chờ', tone: 'neutral' },
  queued: { label: 'Đang chờ', tone: 'neutral' },
  running: { label: 'Đang chạy', tone: 'primary' },
  waiting_retry: { label: 'Chờ thử lại', tone: 'warning' },
  succeeded: { label: 'Thành công', tone: 'success' },
  failed: { label: 'Thất bại', tone: 'danger' },
  skipped: { label: 'Bỏ qua', tone: 'neutral' },
  stopped: { label: 'Dừng giữa chừng', tone: 'neutral' },
};

export const runFilterLabels: Record<AutomationRunFilter, string> = {
  all: 'Tất cả',
  failed: 'Thất bại',
  waiting: 'Chờ thử lại',
  succeeded: 'Thành công',
};

const EVENT_WORDS: Record<AutomationRunItem['trigger'], string> = {
  lead_created: 'Lead mới',
  lead_still_new: 'Lead còn “Mới”',
  opportunity_stage_changed: 'Đổi giai đoạn',
  task_overdue: 'Việc quá hạn',
};

/** "Lead mới · Phạm Mỹ Duyên"; a profile deleted since shows as such. */
export function runEvent(run: AutomationRunItem): string {
  return `${EVENT_WORDS[run.trigger]} · ${run.contactName ?? 'khách đã xóa'}`;
}

/** "10:02 hôm nay", "Hôm qua 21:30", "30/10 21:05". */
export function runWhen(at: string, now: number): string {
  const day = formatDate(at);
  if (day === formatDate(now)) {
    return `${formatTime(at)} hôm nay`;
  }
  if (day === formatDate(now - DAY_MS)) {
    return `Hôm qua ${formatTime(at)}`;
  }
  return `${formatDayMonth(at)} ${formatTime(at)}`;
}

/** The run's badge: "Thất bại ở bước 4" names the step, counted after KHI and NẾU. */
export function runBadge(run: AutomationRunDetail): { label: string; tone: RunTone } {
  const status = runStatusLabels[run.status];
  if (run.status !== 'failed') {
    return status;
  }
  const failed = run.steps.findIndex((step) => step.status === 'failed');
  if (failed === -1) {
    return status;
  }
  const before = 1 + (run.definition.conditions.length > 0 ? 1 : 0);
  return { label: `Thất bại ở bước ${before + failed + 1}`, tone: 'danger' };
}

/** The automation as board 27's header says it: "Đang bật · có lỗi gần đây", "Tạm dừng do lỗi". */
export function automationRunsBadge(
  automation: Pick<AutomationListItem, 'state' | 'pausedReason'>,
  failedLastDay: number,
): { label: string; tone: RunTone } {
  switch (automation.state) {
    case 'draft':
      return { label: 'Bản nháp', tone: 'neutral' };
    case 'paused':
      return automation.pausedReason === 'errors'
        ? { label: 'Tạm dừng do lỗi', tone: 'danger' }
        : { label: 'Tạm dừng', tone: 'neutral' };
    case 'on':
      return {
        label: failedLastDay > 0 ? 'Đang bật · có lỗi gần đây' : 'Đang bật',
        tone: 'success',
      };
  }
}

const SKIP_REASONS: Record<string, string> = {
  conditions: 'Không đạt điều kiện; lượt này không chạy hành động nào.',
  quota: 'Hết lượt chạy của tháng; lượt này không chạy.',
  not_new: 'Lead đã được xử lý trước khi đến giờ nhắc.',
  task_done: 'Công việc đã xong hoặc đổi hạn trước khi quá hạn.',
  gone: 'Dữ liệu của sự kiện đã bị xóa.',
  automation_gone: 'Automation đã bị xóa.',
  paused: 'Automation đã tạm dừng trước khi lượt này chạy xong.',
  by_member: 'Đã bỏ qua lượt này.',
};

/** Why a run ended without running every step, in words; null when it did not. */
export function runReason(run: AutomationRunDetail): string | null {
  return run.reason === null ? null : (SKIP_REASONS[run.reason] ?? null);
}

/** How a failed step reads: what was tried and what to do about it (board 27). */
export function stepFailure(step: AutomationRunStep): { line: string | null; fix: string } {
  const code = step.error?.code ?? '';
  const times = step.attempts > 1 ? ` (${step.attempts} lần)` : '';
  if (step.action.kind === 'webhook') {
    const status = step.error?.httpStatus ?? null;
    const target = `POST ${step.action.url}`;
    if (status !== null) {
      return {
        line: `${target} → ${status}${times}`,
        fix:
          status >= 500 || status === 408 || status === 429
            ? 'Lỗi nằm ở máy chủ nhận, không phải ở Payload. Nhờ người quản lý hệ thống đó kiểm tra, rồi bấm “Thử lại bước này”.'
            : 'Máy chủ nhận từ chối dữ liệu. Kiểm tra địa chỉ và cách hệ thống nhận đọc chữ ký, rồi bấm “Thử lại bước này”.',
      };
    }
    const WEBHOOK_FIXES: Record<string, string> = {
      webhook_blocked_address:
        'Địa chỉ trỏ vào mạng nội bộ nên bị chặn. Dùng địa chỉ công khai của hệ thống nhận.',
      webhook_dns_failed: 'Không tìm thấy tên miền của địa chỉ. Kiểm tra lại địa chỉ webhook.',
      webhook_timeout: 'Máy chủ nhận không trả lời trong 10 giây.',
      webhook_network: 'Không kết nối được tới máy chủ nhận.',
      webhook_invalid_url: 'Địa chỉ webhook không hợp lệ. Sửa ở “Thiết lập”.',
      secret_unavailable: 'Bí mật của bước không đọc được nữa. Bấm “Đổi bí mật” ở “Thiết lập”.',
    };
    return {
      line: `${target}${times}`,
      fix:
        WEBHOOK_FIXES[code] ?? 'Gọi webhook không thành công. Kiểm tra hệ thống nhận rồi thử lại.',
    };
  }
  const FIXES: Record<string, string> = {
    member_gone:
      'Thành viên của bước không còn xem được khách hàng của site. Chọn người khác ở “Thiết lập”.',
    no_owner: 'Khách chưa có người phụ trách. Giao khách cho ai đó rồi thử lại.',
    too_many_tags: 'Đã đủ số nhãn cho phép. Bớt nhãn rồi thử lại.',
    not_configured: 'Bước chưa được cấu hình đủ. Sửa ở “Thiết lập”.',
  };
  return {
    line: null,
    fix:
      FIXES[code] ??
      (code.startsWith('email_')
        ? `Chưa gửi được email${times}. Thử lại sau ít phút.`
        : 'Bước không chạy được. Thử lại sau ít phút.'),
  };
}

/** The step's title on the timeline: "Gọi webhook", "Gửi email nội bộ". */
export function stepTitle(step: AutomationRunStep): string {
  return actionTitle(step.action);
}

/** What a step that ran says it did: "Đã gửi lead tới crm.example.vn". */
export function stepDone(step: AutomationRunStep): string {
  if (step.summary !== null) {
    return `Đã ${step.summary}.`;
  }
  return step.action.kind === 'webhook' ? `Đã gửi tới ${webhookHost(step.action.url)}.` : 'Xong.';
}
