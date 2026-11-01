import {
  type Domain,
  type DomainStatus,
  domainStatusLabels,
  type RecordState,
} from '@plp/contracts';
import type { BadgeTone } from '@plp/ui';
import { formatDate } from '../../lib/format';

export const statusTones: Record<DomainStatus, BadgeTone> = {
  taken: 'warning',
  pending_dns: 'info',
  misconfigured: 'warning',
  issuing: 'info',
  active: 'success',
  lost: 'danger',
  needs_attention: 'danger',
};

/** The legend of board 13, in the order a domain goes through. */
export const statusLegend: { status: DomainStatus; label: string; description: string }[] = [
  {
    status: 'pending_dns',
    label: domainStatusLabels.pending_dns,
    description: 'Đang chờ bản ghi có hiệu lực, thường vài phút, tối đa 48 giờ.',
  },
  {
    status: 'misconfigured',
    label: domainStatusLabels.misconfigured,
    description: 'Tìm thấy bản ghi nhưng giá trị chưa đúng.',
  },
  {
    status: 'taken',
    label: domainStatusLabels.taken,
    description: 'Thêm bản ghi TXT để chứng minh tên miền là của bạn.',
  },
  {
    status: 'issuing',
    label: domainStatusLabels.issuing,
    description: 'Đã xác minh, đang bật HTTPS. Bạn không cần làm gì thêm.',
  },
  {
    status: 'active',
    label: domainStatusLabels.active,
    description: 'Khách mở được trang qua HTTPS.',
  },
  {
    status: 'lost',
    label: domainStatusLabels.lost,
    description: 'Từng hoạt động, nay DNS không còn trỏ đúng.',
  },
  {
    status: 'needs_attention',
    label: domainStatusLabels.needs_attention,
    description: 'DNS đã đúng nhưng không bật được HTTPS sau một giờ.',
  },
];

export const recordStateLabels: Record<RecordState, string> = {
  missing: 'Đang chờ',
  ok: 'Đã thấy',
  wrong: 'Sai giá trị',
};

export const recordStateTones: Record<RecordState, BadgeTone> = {
  missing: 'info',
  ok: 'success',
  wrong: 'warning',
};

/** The HTTPS line of a domain row (board 13). */
export function httpsLine(domain: Pick<Domain, 'status' | 'httpsValidUntil'>): string {
  if (domain.httpsValidUntil !== null) {
    return `HTTPS hợp lệ tới ${formatDate(domain.httpsValidUntil)}`;
  }
  switch (domain.status) {
    case 'issuing':
      return 'Đang cấp HTTPS';
    case 'active':
    case 'lost':
      return 'HTTPS do máy chủ biên cấp';
    case 'needs_attention':
      return 'Chưa bật được HTTPS';
    default:
      return 'Chưa có HTTPS';
  }
}

/** The step of board 14 a domain is at: 2 records, 3 ownership, 4 HTTPS, 5 active. */
export function connectStep(status: DomainStatus): 2 | 3 | 4 | 5 {
  switch (status) {
    case 'taken':
      return 3;
    case 'issuing':
    case 'needs_attention':
      return 4;
    case 'active':
      return 5;
    default:
      return 2;
  }
}

/** The box at the top of board 14: where the domain stands and what to do. */
export function statusBox(domain: Pick<Domain, 'status' | 'hostname'>): {
  tone: 'info' | 'warning' | 'danger' | 'success';
  title: string;
  body: string;
} {
  switch (domain.status) {
    case 'pending_dns':
      return {
        tone: 'info',
        title: 'Đang chờ bản ghi DNS có hiệu lực',
        body: 'Hệ thống tự kiểm tra mỗi phút trong giờ đầu rồi mỗi 10 phút. Thường mất vài phút, đôi khi tới 48 giờ tùy nhà cung cấp.',
      };
    case 'misconfigured':
      return {
        tone: 'warning',
        title: 'Bản ghi chưa đúng',
        body: 'Đã tìm thấy bản ghi nhưng giá trị khác với bảng dưới. Sửa lại tại nhà cung cấp tên miền rồi bấm "Kiểm tra ngay".',
      };
    case 'taken':
      return {
        tone: 'warning',
        title: 'Tên miền này đang được một site khác dùng',
        body: 'Vì lý do bảo mật, chúng tôi không cho biết site đó thuộc ai. Nếu bạn sở hữu tên miền, hãy thêm bản ghi TXT dưới đây. Sau khi xác minh, tên miền chuyển về site này và site kia ngừng dùng nó.',
      };
    case 'issuing':
      return {
        tone: 'info',
        title: 'Đang cấp chứng chỉ HTTPS',
        body: 'Đã xác minh quyền sở hữu. Bạn không cần làm gì thêm; chúng tôi sẽ gửi email khi xong.',
      };
    case 'needs_attention':
      return {
        tone: 'danger',
        title: 'Chưa bật được HTTPS',
        body: 'DNS đã đúng nhưng chứng chỉ chưa cấp được sau một giờ. Kiểm tra bản ghi CAA hoặc proxy của nhà cung cấp (như Cloudflare) đang bật.',
      };
    case 'lost':
      return {
        tone: 'danger',
        title: `${domain.hostname} đang không truy cập được`,
        body: 'Bản ghi DNS không còn trỏ tới hệ thống. Thêm lại bản ghi như bảng dưới; các trang vẫn mở được ở địa chỉ mặc định.',
      };
    case 'active':
      return {
        tone: 'success',
        title: `${domain.hostname} đã hoạt động`,
        body: 'Mọi trang đang live mở được qua địa chỉ này.',
      };
  }
}
