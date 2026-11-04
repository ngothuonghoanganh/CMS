import {
  type Domain,
  type DomainListResponse,
  type DomainStatus,
  domainStatusLabels,
  type RecordState,
} from '@plp/contracts';
import type { BadgeTone } from '@plp/ui';
import { type DateInput, formatDate, formatTime } from '../../lib/format';

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

/** "CNAME" or "A": the record that points the domain here. */
function routingType(domain: Pick<Domain, 'records'>): string {
  return domain.records.find((record) => record.type !== 'TXT')?.type ?? 'CNAME';
}

const DAY_MS = 86_400_000;

/** "08:12 hôm nay", "08:12 hôm qua", "08:12 24/10/2026": when a domain stopped pointing here. */
function lostAt(at: DateInput, now: DateInput): string {
  const day = formatDate(at);
  // Vietnam keeps one offset all year, so the day before is 24 hours earlier.
  const when =
    day === formatDate(now)
      ? 'hôm nay'
      : day === formatDate(new Date(new Date(now).getTime() - DAY_MS))
        ? 'hôm qua'
        : day;
  return `${formatTime(at)} ${when}`;
}

/**
 * The line under a domain of board 13: what the last check saw, as the box of board 14 says it,
 * or since when and by whom an active one works. `redirectsTo` is the active primary custom domain
 * other active domains redirect to (null while the default address is primary).
 */
export function diagnosisLine(
  domain: Pick<
    Domain,
    'status' | 'kind' | 'primary' | 'records' | 'found' | 'activeSince' | 'lostSince' | 'addedBy'
  >,
  redirectsTo: string | null,
  now: DateInput,
): string {
  const routing = routingType(domain);
  switch (domain.status) {
    case 'active':
      if (!domain.primary && redirectsTo !== null) {
        return `${domain.kind === 'apex' ? 'Tên miền gốc' : 'Tên miền phụ'} · đang chuyển hướng → ${redirectsTo}`;
      }
      return domain.activeSince === null
        ? `Thêm bởi ${domain.addedBy.name}.`
        : `Kết nối từ ${formatDate(domain.activeSince)} bởi ${domain.addedBy.name}.`;
    case 'issuing':
      return 'DNS đúng, đã xác minh quyền sở hữu.';
    case 'needs_attention':
      return 'DNS đúng nhưng chưa bật được HTTPS sau một giờ.';
    case 'taken':
      return 'Một site khác đang dùng tên miền này. Thêm bản ghi TXT để chứng minh nó là của bạn.';
    case 'lost': {
      const since = domain.lostSince === null ? '' : ` lúc ${lostAt(domain.lostSince, now)}`;
      return domain.found.length === 0
        ? `Bản ghi ${routing} đã bị xóa${since}.`
        : `${routing} đổi${since}, đang trỏ tới ${domain.found.map((found) => found.value).join(', ')}.`;
    }
    case 'misconfigured': {
      const wrongRouting = domain.records.some(
        (record) => record.type !== 'TXT' && record.state === 'wrong',
      );
      if (!wrongRouting) {
        return 'Bản ghi TXT chưa đúng mã xác minh của site này.';
      }
      const foundTypes = [...new Set(domain.found.map((found) => found.type))];
      return foundTypes.length > 0 && !foundTypes.includes(routing as 'CNAME' | 'A')
        ? `Đang có bản ghi ${foundTypes.join(', ')}, cần đổi sang ${routing}.`
        : `${routing} đang trỏ tới ${domain.found.map((found) => found.value).join(', ')}, chưa đúng giá trị.`;
    }
    case 'pending_dns': {
      const missing = domain.records
        .filter((record) => record.state === 'missing')
        .map((record) => record.type);
      const types = [...new Set(missing.length === 0 ? [routing, 'TXT'] : missing)];
      return `Chưa thấy bản ghi ${types.join(' và ')}.`;
    }
  }
}

/**
 * How many live pages a new primary address moves, with one of them as an example ("Đặt làm
 * chính" on board 13, and the choice on board 14).
 */
export function movedPagesLine(livePages: DomainListResponse['livePages'], host: string): string {
  if (livePages.count === 0 || livePages.exampleSlug === null) {
    return 'Chưa có trang nào đang live; các trang xuất bản sau sẽ dùng địa chỉ này.';
  }
  const example = livePages.exampleSlug === '' ? host : `${host}/${livePages.exampleSlug}`;
  return `${livePages.count} trang đang live sẽ có địa chỉ mới, ví dụ ${example}.`;
}

/** The heading of the step card of board 14, which follows where the domain stands. */
export function connectHeading(status: DomainStatus | null): string {
  switch (status) {
    case null:
      return 'Bạn muốn dùng tên miền nào?';
    case 'pending_dns':
      return 'Thêm bản ghi DNS';
    case 'misconfigured':
    case 'lost':
      return 'Sửa bản ghi DNS';
    case 'taken':
      return 'Xác minh quyền sở hữu';
    case 'issuing':
      return 'Đang bật HTTPS';
    case 'needs_attention':
      return 'Chưa bật được HTTPS';
    case 'active':
      return 'Đã kết nối';
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
        title: `${domain.hostname} đã hoạt động với HTTPS.`,
        body: 'Mọi trang đang live đã mở được qua địa chỉ này. Chứng chỉ tự gia hạn trước khi hết hạn.',
      };
  }
}
