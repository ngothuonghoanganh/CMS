import {
  type CappedCount,
  formatLeadPhone,
  type LeadCounts,
  type LeadDetail,
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
