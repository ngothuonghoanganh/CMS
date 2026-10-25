import {
  type CappedCount,
  formatLeadPhone,
  type LeadCounts,
  type LeadDetail,
  type LeadNotification,
  type LeadNotificationErrorCode,
  type LeadRecipientStatus,
  type LeadSource,
  leadSourceLabel,
  type LeadStatus,
  type SpamReason,
} from '@plp/contracts';
import type { BadgeTone } from '@plp/ui';
import { type DateInput, formatDate, formatDayMonth, formatTime } from '../../lib/format';

/** Badge colors of board 10: "Mới" in the brand color, "Hẹn lịch" and "Đã chốt" green. */
export const leadStatusTones: Record<LeadStatus, BadgeTone> = {
  new: 'info',
  contacted: 'neutral',
  scheduled: 'success',
  unreachable: 'warning',
  won: 'success',
};

export const spamReasonLabels: Record<SpamReason, string> = {
  honeypot: 'Ô ẩn chống bot đã được điền',
  too_fast: 'Gửi trong chưa tới 3 giây sau khi mở form',
};

/** "48", or "999+" past the cap. */
export function cappedCountLabel(count: CappedCount): string {
  return count.capped ? `${count.count}+` : String(count.count);
}

/** The sidebar badge "12 mới"; null without new leads. */
export function newLeadsBadge(counts: LeadCounts): string | null {
  return counts.new.count === 0 ? null : `${cappedCountLabel(counts.new)} mới`;
}

function sameDay(a: DateInput, b: DateInput): boolean {
  return formatDate(a) === formatDate(b);
}

/** The "LÚC" column: "16:42" today, "Hôm qua", then "22/10" (or "22/10/2025" another year). */
export function leadTimeLabel(createdAt: DateInput, now: DateInput): string {
  if (sameDay(createdAt, now)) {
    return formatTime(createdAt);
  }
  const yesterday = new Date(new Date(now).getTime() - 86_400_000);
  if (sameDay(createdAt, yesterday)) {
    return 'Hôm qua';
  }
  return formatDate(createdAt).slice(-4) === formatDate(now).slice(-4)
    ? formatDayMonth(createdAt)
    : formatDate(createdAt);
}

/** Under the name in the detail: "24/10/2026 · 16:42 · từ điện thoại". */
export function leadDetailMeta(lead: Pick<LeadDetail, 'createdAt' | 'device'>): string {
  const device = lead.device === 'mobile' ? 'từ điện thoại' : 'từ máy tính';
  return `${formatDate(lead.createdAt)} · ${formatTime(lead.createdAt)} · ${device}`;
}

/** "facebook / cpc / uu-dai-t11", or "trực tiếp". */
export function leadSourceLine(source: LeadSource): string {
  const label = leadSourceLabel(source);
  return source.campaign === null ? label : `${label} / ${source.campaign}`;
}

export function telUrl(phone: string): string {
  return `tel:${phone}`;
}

/** Zalo finds people by their Vietnamese number; null for other countries. */
export function zaloUrl(phone: string): string | null {
  return phone.startsWith('+84')
    ? `https://zalo.me/${formatLeadPhone(phone).replaceAll(' ', '')}`
    : null;
}

/** "lúc 16:42:07" of the consent evidence, in Vietnam time. */
export function consentMoment(at: DateInput): string {
  const seconds = String(new Date(at).getUTCSeconds()).padStart(2, '0');
  return `lúc ${formatTime(at)}:${seconds}`;
}

export const recipientStatusLabels: Record<LeadRecipientStatus, string> = {
  confirmed: 'Đã xác nhận',
  pending: 'Chờ xác nhận',
  expired: 'Liên kết hết hạn',
  unsent: 'Chưa gửi được thư',
};

export const recipientStatusTones: Record<LeadRecipientStatus, BadgeTone> = {
  confirmed: 'success',
  pending: 'info',
  expired: 'warning',
  unsent: 'danger',
};

export const notificationErrorLabels: Record<LeadNotificationErrorCode, string> = {
  no_recipients: 'site chưa có email nhận lead nào đã xác nhận',
  smtp_unavailable: 'không kết nối được máy chủ gửi thư',
  smtp_rejected: 'máy chủ gửi thư từ chối thư',
  timeout: 'máy chủ gửi thư không trả lời kịp',
  unknown: 'lỗi không xác định',
};

/** The "Đã gửi tới" line of a lead (ADR-018); null for a lead stored before notifications. */
export type NotificationView =
  | { kind: 'sent'; text: string; at: string; warning: string | null }
  | { kind: 'waiting'; text: string }
  | { kind: 'failed'; text: string }
  | { kind: 'skipped'; text: string };

/**
 * `spam`: the lead is in "Nghi ngờ spam" now. Spam is never emailed, so a lead there shows that
 * instead of a failure to fix.
 */
export function notificationView(
  notification: LeadNotification | null,
  spam: boolean,
): NotificationView | null {
  if (notification === null) {
    return null;
  }
  if (notification.status === 'sent') {
    const refused = notification.rejectedRecipients ?? 0;
    return {
      kind: 'sent',
      text: `Email thông báo · ${notification.recipients ?? 0} người nhận`,
      at: notification.sentAt ?? '',
      warning:
        refused === 0
          ? null
          : `${refused} địa chỉ bị máy chủ thư từ chối. Kiểm tra lại trong "Nơi nhận lead".`,
    };
  }
  if (spam) {
    return { kind: 'skipped', text: 'Không gửi email: lead nghi ngờ spam' };
  }
  switch (notification.status) {
    case 'pending':
    case 'sending': {
      // While sending, `attempts` already counts the attempt that is running.
      const attempt =
        notification.status === 'sending' ? notification.attempts : notification.attempts + 1;
      return {
        kind: 'waiting',
        text:
          attempt <= 1
            ? 'Đang gửi email thông báo'
            : `Đang thử gửi lại email thông báo (lần ${attempt})`,
      };
    }
    case 'failed':
      return {
        kind: 'failed',
        text: `Lỗi đồng bộ · ${notificationErrorLabels[notification.lastErrorCode ?? 'unknown']}`,
      };
    case 'skipped':
      return { kind: 'skipped', text: 'Không gửi email: lead từng bị nghi ngờ spam' };
  }
}
