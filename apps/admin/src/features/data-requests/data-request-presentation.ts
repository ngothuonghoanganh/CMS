import {
  type DataRequest,
  type DataRequestLogEntry,
  type DataRequestMatch,
  type DataRequestType,
  formatLeadPhone,
} from '@plp/contracts';
import type { BadgeTone } from '@plp/ui';
import { formatDate, formatDayMonth } from '../../lib/format';
import { cappedCountLabel } from '../leads/lead-presentation';

/** What each kind of request asks, as "Ghi nhận yêu cầu" explains it. */
export const dataRequestTypeDescriptions: Record<DataRequestType, string> = {
  access: 'Xuất file dữ liệu đang lưu của người này để gửi cho họ.',
  rectify: 'Sửa họ tên, số điện thoại hoặc email trong các lead của họ.',
  delete: 'Xóa mọi lead có số điện thoại hoặc email này trong site.',
  withdraw_marketing:
    'Ghi nhận việc rút đồng ý nhận ưu đãi trên các lead của họ. Lead vẫn được giữ.',
};

export interface DataRequestStatusView {
  text: string;
  tone: BadgeTone;
  icon: 'clock' | 'check' | 'alert';
}

/** The badge of "TRẠNG THÁI" (board 12): what the owner owes the person, or when it was done. */
export function dataRequestStatusView(request: DataRequest, now: number): DataRequestStatusView {
  switch (request.status) {
    case 'open':
      return Date.parse(request.respondBy) < now
        ? { text: 'Quá hạn phản hồi', tone: 'danger', icon: 'alert' }
        : { text: 'Cần phản hồi', tone: 'warning', icon: 'clock' };
    case 'responded':
      return Date.parse(request.completeBy) < now
        ? { text: 'Quá hạn hoàn tất', tone: 'danger', icon: 'alert' }
        : { text: 'Đang xử lý', tone: 'info', icon: 'clock' };
    case 'completed': {
      const day = request.completedAt === null ? '' : ` ${formatDayMonth(request.completedAt)}`;
      return {
        text: request.type === 'access' ? `Đã gửi bản sao${day}` : `Hoàn tất${day}`,
        tone: 'success',
        icon: 'check',
      };
    }
  }
}

export interface DeadlineLine {
  text: string;
  /** Already past. */
  overdue: boolean;
}

/** "HẠN": the deadlines still ahead, the next one first; none once the request is completed. */
export function deadlineLines(request: DataRequest, now: number): DeadlineLine[] {
  const respond = {
    text: `Phản hồi trước ${formatDayMonth(request.respondBy)}`,
    overdue: Date.parse(request.respondBy) < now,
  };
  const complete = {
    text: `Hoàn tất trước ${formatDayMonth(request.completeBy)}`,
    overdue: Date.parse(request.completeBy) < now,
  };
  switch (request.status) {
    case 'open':
      return [respond, complete];
    case 'responded':
      return [complete];
    case 'completed':
      return [];
  }
}

/** A recorded phone number as people read it; a masked one is shown as stored. */
function phoneText(request: DataRequest, phone: string): string {
  return request.masked ? phone : formatLeadPhone(phone);
}

/** "NGƯỜI YÊU CẦU": the name, or the email of a person who gave none (board 12). */
export function requesterName(request: DataRequest): string {
  const { name, phone, email } = request.contact;
  return name ?? email ?? (phone === null ? '—' : phoneText(request, phone));
}

/**
 * The line under the name: how to reach the person and how many leads are theirs, e.g.
 * "0987 106 223 · 1 lead", "qua email · 1 lead" or "0987 *** 223 · đã xóa 2 lead".
 */
export function requesterLine(request: DataRequest): string {
  const { name, phone, email } = request.contact;
  const reach =
    phone !== null
      ? phoneText(request, phone)
      : email === null
        ? null
        : name === null
          ? 'qua email'
          : email;
  const leads =
    request.leads !== null
      ? `${cappedCountLabel(request.leads)} lead`
      : request.type === 'delete' && request.completedCount !== null
        ? `đã xóa ${request.completedCount} lead`
        : null;
  return [reach, leads].filter((part) => part !== null).join(' · ');
}

/** One line of "Nhật ký". */
export function logSentence(entry: DataRequestLogEntry, type: DataRequestType): string {
  switch (entry.action) {
    case 'created':
      return 'Ghi nhận yêu cầu';
    case 'responded':
      return 'Đã phản hồi người yêu cầu';
    case 'exported':
      return entry.count === null ? 'Xuất dữ liệu' : `Xuất dữ liệu ${entry.count} lead`;
    case 'completed':
      switch (type) {
        case 'access':
          return 'Đã gửi bản sao dữ liệu, hoàn tất';
        case 'rectify':
          return 'Đã sửa thông tin, hoàn tất';
        case 'delete':
          return `Đã xóa ${entry.count ?? 0} lead, hoàn tất`;
        case 'withdraw_marketing':
          return `Đã rút đồng ý nhận ưu đãi ở ${entry.count ?? 0} lead, hoàn tất`;
      }
  }
}

/** The marketing consent of one of the person's leads, for a withdrawal. */
export function matchMarketing(match: DataRequestMatch): string {
  if (!match.marketing) {
    return 'Không chọn nhận ưu đãi';
  }
  return match.marketingWithdrawnAt === null
    ? 'Đang nhận ưu đãi'
    : `Đã rút ngày ${formatDate(match.marketingWithdrawnAt)}`;
}
