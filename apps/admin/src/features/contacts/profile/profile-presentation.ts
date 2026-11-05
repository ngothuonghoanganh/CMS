import {
  type ContactMeeting,
  type ContactProfile,
  type ContactTask,
  DELETED_PAGE_LABEL,
  holdersOf,
  manualContactChannelShortLabels,
  type Permission,
  permissionGroups,
  type TimelineEntry,
} from '@plp/contracts';
import { formatDayMonth, formatTime } from '../../../lib/format';

/** The admin works in Vietnam's time (UTC+7, no daylight saving), like every label (lib/format). */
const VN_OFFSET_MS = 7 * 3_600_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const;

/** "TT" for "Nguyễn Thu Trang": the last two words, as people are called. */
export function profileInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(-2)
    .map((word) => word.charAt(0).toLocaleUpperCase('vi'))
    .join('');
}

/** "0912 345 678" for "+84912345678"; other numbers as stored. */
export function displayPhone(phone: string): string {
  const local = /^\+84(\d{9})$/.exec(phone)?.[1];
  return local === undefined
    ? phone
    : `0${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}

export function telHref(phone: string): string {
  return `tel:${phone}`;
}

/** "Nhắn Zalo" (ADR-033): Zalo opens a chat from the local number. */
export function zaloHref(phone: string): string {
  const local = /^\+84(\d{9})$/.exec(phone)?.[1];
  return `https://zalo.me/${local === undefined ? phone.replace(/^\+/, '') : `0${local}`}`;
}

function vnParts(time: number) {
  const shifted = new Date(time + VN_OFFSET_MS);
  return {
    day: Math.floor((time + VN_OFFSET_MS) / DAY),
    weekday: shifted.getUTCDay(),
  };
}

/** The value of a `datetime-local` input for a moment, in Vietnam's time. */
export function toLocalInput(time: number): string {
  return new Date(time + VN_OFFSET_MS).toISOString().slice(0, 16);
}

/** The moment a `datetime-local` value names in Vietnam's time; null when it is empty or bad. */
export function fromLocalInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return null;
  }
  const time = Date.parse(`${value}:00.000Z`) - VN_OFFSET_MS;
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/** A default due time: the next whole hour, at least 30 minutes from now. */
export function defaultDue(now: number): number {
  return Math.ceil((now + 30 * MINUTE) / HOUR) * HOUR;
}

function span(ms: number): string {
  if (ms < HOUR) {
    return `${Math.max(1, Math.floor(ms / MINUTE))} phút`;
  }
  if (ms < DAY) {
    return `${Math.floor(ms / HOUR)} giờ`;
  }
  return `${Math.floor(ms / DAY)} ngày`;
}

/** "Hôm nay 16:00", "Mai 10:00", or "03/11 10:00". */
function dueMoment(iso: string, now: number): string {
  const time = Date.parse(iso);
  const days = vnParts(time).day - vnParts(now).day;
  const prefix = days === 0 ? 'Hôm nay' : days === 1 ? 'Mai' : formatDayMonth(iso);
  return `${prefix} ${formatTime(iso)}`;
}

export function isOverdue(task: ContactTask, now: number): boolean {
  return task.doneAt === null && Date.parse(task.dueAt) < now;
}

/** "Quá hạn 25 phút · Thu Hà" or "Mai 10:00 · Thu Hà". "Quá hạn" is derived, never stored. */
export function taskDueLine(task: ContactTask, now: number): string {
  const when = isOverdue(task, now)
    ? `Quá hạn ${span(now - Date.parse(task.dueAt))}`
    : dueMoment(task.dueAt, now);
  return task.assignee === null ? when : `${when} · ${task.assignee.name}`;
}

/** "CN 02/11 · 09:30" */
export function meetingMoment(iso: string): string {
  return `${WEEKDAYS[vnParts(Date.parse(iso)).weekday] ?? ''} ${formatDayMonth(iso)} · ${formatTime(iso)}`;
}

/** "Khám và chụp phim 3D · Chi nhánh Quận 3 · BS. Trần Minh" */
export function meetingDetail(meeting: Omit<ContactMeeting, 'id'>): string {
  return [meeting.note, meeting.place, meeting.with].filter((part) => part !== '').join(' · ');
}

export interface TimelineView {
  tone: 'lead' | 'note' | 'meeting';
  title: string;
  when: string;
  body: string;
}

/** An entry of "Dòng thời gian" as board 23 reads it. */
export function timelineView(entry: TimelineEntry): TimelineView {
  const moment = `${formatDayMonth(entry.at)} · ${formatTime(entry.at)}`;
  switch (entry.kind) {
    case 'lead': {
      const source = [entry.source, entry.medium, entry.campaign].filter(Boolean).join(' / ');
      return {
        tone: 'lead',
        title: `Lead mới từ “${entry.page.title ?? DELETED_PAGE_LABEL}”`,
        when: moment,
        body: [
          entry.message === null ? null : `Hỏi: ${entry.message}`,
          entry.consentVersion === null ? null : `Đồng ý xử lý dữ liệu v${entry.consentVersion}`,
          source,
          entry.joined ? 'tự gom vào hồ sơ vì trùng số điện thoại' : null,
        ]
          .filter((part): part is string => part !== null && part !== '')
          .join(' · '),
      };
    }
    case 'note':
      return {
        tone: 'note',
        title: 'Ghi chú',
        when: entry.actor === null ? moment : `${moment} · ${entry.actor.name}`,
        body: entry.text,
      };
    case 'meeting':
      return {
        tone: 'meeting',
        title: `Đặt lịch hẹn ${meetingMoment(entry.meeting.at)}`,
        when: entry.actor === null ? moment : `${moment} · ${entry.actor.name}`,
        body: meetingDetail(entry.meeting),
      };
  }
}

/** "Xử lý dữ liệu để tư vấn · 28/10 14:02 · nội dung đồng ý v3 · trang “…” bản v12" */
export function processingLine(contact: ContactProfile): string | null {
  const processing = contact.consent.processing;
  if (processing === null) {
    return null;
  }
  return [
    'Xử lý dữ liệu để tư vấn',
    `${formatDayMonth(processing.at)} ${formatTime(processing.at)}`,
    processing.version === null ? null : `nội dung đồng ý v${processing.version}`,
    `trang “${processing.page.title ?? DELETED_PAGE_LABEL}” bản v${processing.pageVersion}`,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

/** Where a profile added by hand came from, as the source recorded it (ADR-033). */
export function manualOriginLine(contact: ContactProfile): string | null {
  if (contact.origin.kind !== 'manual') {
    return null;
  }
  const origin = contact.origin;
  return [
    `Thêm tay · ${manualContactChannelShortLabels[origin.channel]}`,
    `${formatDayMonth(origin.at)} ${formatTime(origin.at)}`,
    origin.addedBy === null ? null : `${origin.addedBy.name} ghi`,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

export function marketingLine(contact: ContactProfile): string {
  const marketing = contact.consent.marketing;
  return marketing.consented
    ? `Đồng ý nhận ưu đãi${marketing.at === null ? '' : ` · ${formatDayMonth(marketing.at)} ${formatTime(marketing.at)}`}.`
    : 'Không đồng ý nhận ưu đãi. Không đưa vào chiến dịch quảng cáo.';
}

/** "Cần quyền “Xử lý yêu cầu dữ liệu…”. Hỏi Chủ sở hữu." for a menu item the member lacks. */
export function missingPermissionNote(permission: Permission): string {
  const label =
    permissionGroups.flatMap((group) => group.rows).find((row) => row.permission === permission)
      ?.label ?? permission;
  return `Cần quyền “${label}”. Hỏi ${holdersOf(permission)}.`;
}
