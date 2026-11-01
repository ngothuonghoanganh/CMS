import { formatLeadPhone, leadSourceLabel, vnDateTimeOf } from '@plp/contracts';
import type { EmailMessage } from './email-sender.js';

/** Text for HTML: every character with a meaning in markup is escaped. */
export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

type EmailContent = Omit<EmailMessage, 'to'>;

/** A simple layout every client renders: one column, inline styles, no images. */
function layout(title: string, body: string): string {
  return `<!doctype html><html lang="vi"><body style="margin:0;padding:24px;background:#f5f6f8;font-family:Arial,sans-serif;color:#15171c"><div style="max-width:560px;margin:0 auto;padding:24px;background:#ffffff;border-radius:12px"><h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(title)}</h1>${body}</div></body></html>`;
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:6px 12px 6px 0;color:#5e6573;vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td><td style="padding:6px 0;white-space:pre-wrap">${escapeHtml(value)}</td></tr>`;
}

export interface LeadEmailInput {
  siteName: string;
  pageTitle: string;
  releaseVersion: number;
  lead: {
    name: string;
    phone: string;
    email: string | null;
    message: string | null;
    source: { source: string; medium: string; campaign: string | null };
    createdAt: Date;
  };
  /** The lead in the admin inbox. */
  leadUrl: string;
}

/** The email confirmed addresses get for a new lead (ADR-018). */
export function leadNotificationEmail(input: LeadEmailInput): EmailContent {
  const { lead } = input;
  const source = leadSourceLabel(lead.source);
  const rows: Array<[string, string]> = [
    ['Họ và tên', lead.name],
    ['Số điện thoại', formatLeadPhone(lead.phone)],
    ...(lead.email === null ? [] : ([['Email', lead.email]] as Array<[string, string]>)),
    ...(lead.message === null ? [] : ([['Lời nhắn', lead.message]] as Array<[string, string]>)),
    ['Trang', `${input.pageTitle} (v${input.releaseVersion})`],
    ['Nguồn', lead.source.campaign === null ? source : `${source} / ${lead.source.campaign}`],
    ['Lúc', `${vnDateTimeOf(lead.createdAt)} (giờ Việt Nam)`],
  ];
  const footer = `Bạn nhận email này vì địa chỉ này đã được thêm vào "Nơi nhận lead" của ${input.siteName} và đã xác nhận.`;
  const subject = `[${input.siteName}] Lead mới: ${lead.name}`;
  const text = [
    `${input.siteName} vừa nhận một đăng ký mới.`,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    `Mở lead trong hộp thư: ${input.leadUrl}`,
    '',
    footer,
  ].join('\n');
  const html = layout(
    `Lead mới cho ${input.siteName}`,
    `<table style="border-collapse:collapse;font-size:14px;line-height:1.5">${rows
      .map(([label, value]) => row(label, value))
      .join(
        '',
      )}</table><p style="margin:20px 0"><a href="${escapeHtml(input.leadUrl)}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#4338ca;color:#ffffff;text-decoration:none;font-weight:600">Mở lead trong hộp thư</a></p><p style="margin:0;font-size:12px;color:#5e6573">${escapeHtml(footer)}</p>`,
  );
  return { subject, text, html };
}

export interface ConfirmationEmailInput {
  siteName: string;
  /** Who added the address, as the admin shows their name. */
  invitedBy: string;
  confirmUrl: string;
  validDays: number;
}

/** The email that asks an address to confirm before it receives any lead (ADR-018). */
export function recipientConfirmationEmail(input: ConfirmationEmailInput): EmailContent {
  const intro = `${input.invitedBy} đã thêm địa chỉ này vào "Nơi nhận lead" của ${input.siteName}. Sau khi bạn xác nhận, mỗi khi có khách gửi form trên các trang của ${input.siteName}, bạn sẽ nhận một email kèm thông tin của khách.`;
  const validity = `Liên kết có hiệu lực ${input.validDays} ngày. Nếu bạn không biết việc này, hãy bỏ qua email: địa chỉ sẽ không nhận thông tin nào.`;
  return {
    subject: `Xác nhận nhận lead của ${input.siteName}`,
    text: [intro, '', `Xác nhận tại: ${input.confirmUrl}`, '', validity].join('\n'),
    html: layout(
      `Xác nhận nhận lead của ${input.siteName}`,
      `<p style="margin:0 0 16px;line-height:1.55">${escapeHtml(intro)}</p><p style="margin:0 0 16px"><a href="${escapeHtml(input.confirmUrl)}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#4338ca;color:#ffffff;text-decoration:none;font-weight:600">Xác nhận nhận lead</a></p><p style="margin:0;font-size:12px;color:#5e6573">${escapeHtml(validity)}</p>`,
    ),
  };
}

/** A button every client renders. */
function button(href: string, label: string): string {
  return `<p style="margin:0 0 16px"><a href="${escapeHtml(href)}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#4338ca;color:#ffffff;text-decoration:none;font-weight:600">${escapeHtml(label)}</a></p>`;
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;line-height:1.55">${escapeHtml(text)}</p>`;
}

function smallPrint(text: string): string {
  return `<p style="margin:0;font-size:12px;color:#5e6573">${escapeHtml(text)}</p>`;
}

export interface MemberInvitationEmailInput {
  workspaceName: string;
  invitedBy: string;
  roleLabel: string;
  /** "toàn workspace" or the sites, e.g. "site Nha khoa Smile Care". */
  scope: string;
  acceptUrl: string;
  validDays: number;
}

/** The invitation to join a workspace (board 15b, ADR-021). */
export function memberInvitationEmail(input: MemberInvitationEmailInput): EmailContent {
  const title = `${input.invitedBy} mời bạn vào ${input.workspaceName}`;
  const intro = `Bạn được mời làm ${input.roleLabel} trên ${input.scope} của ${input.workspaceName}.`;
  const validity = `Lời mời dùng được một lần, cho đúng địa chỉ email này, trong ${input.validDays} ngày. Không biết người mời? Bạn có thể bỏ qua email này, tài khoản sẽ không được tạo.`;
  return {
    subject: title,
    text: [intro, '', `Nhận lời mời tại: ${input.acceptUrl}`, '', validity].join('\n'),
    html: layout(
      title,
      `${paragraph(intro)}${button(input.acceptUrl, 'Nhận lời mời')}${smallPrint(validity)}`,
    ),
  };
}

export interface AccessRequestEmailInput {
  workspaceName: string;
  requesterName: string;
  requesterEmail: string;
  currentRole: string;
  requestedRole: string;
  /** "toàn workspace" or "các site hiện tại". */
  scope: string;
  note: string;
  reviewUrl: string;
}

/** Tells Chủ sở hữu a member asks for another role; the link only opens the request (ADR-021). */
export function accessRequestEmail(input: AccessRequestEmailInput): EmailContent {
  const title = `${input.requesterName} xin đổi quyền trong ${input.workspaceName}`;
  const intro = `${input.requesterName} (${input.requesterEmail}) đang là ${input.currentRole} và xin làm ${input.requestedRole} trên ${input.scope}.`;
  const note = input.note === '' ? null : `Lời nhắn: ${input.note}`;
  const action =
    'Mở yêu cầu để chấp nhận, chỉnh vai trò và site trước khi lưu, hoặc từ chối. Quyền chỉ đổi khi bạn lưu trên màn Thành viên.';
  return {
    subject: title,
    text: [intro, ...(note === null ? [] : ['', note]), '', action, input.reviewUrl].join('\n'),
    html: layout(
      title,
      `${paragraph(intro)}${note === null ? '' : paragraph(note)}${button(input.reviewUrl, 'Xem yêu cầu')}${smallPrint(action)}`,
    ),
  };
}

export interface AccessDecisionEmailInput {
  workspaceName: string;
  accepted: boolean;
  /** The role and sites decided, for an accepted request. */
  roleLabel: string;
  scope: string;
  openUrl: string;
}

/** Tells the member how Chủ sở hữu decided their request (ADR-021). */
export function accessDecisionEmail(input: AccessDecisionEmailInput): EmailContent {
  const title = input.accepted
    ? `Yêu cầu đổi quyền trong ${input.workspaceName} đã được chấp nhận`
    : `Yêu cầu đổi quyền trong ${input.workspaceName} chưa được chấp nhận`;
  const body = input.accepted
    ? `Bạn là ${input.roleLabel} trên ${input.scope}. Quyền mới có hiệu lực ngay.`
    : 'Chủ sở hữu đã từ chối yêu cầu. Quyền của bạn giữ nguyên; bạn có thể gửi yêu cầu khác.';
  return {
    subject: title,
    text: [body, '', input.openUrl].join('\n'),
    html: layout(title, `${paragraph(body)}${button(input.openUrl, `Mở ${input.workspaceName}`)}`),
  };
}

export interface DomainEmailInput {
  hostname: string;
  siteName: string;
  /** "Tên miền" of the site in the admin. */
  domainsUrl: string;
}

/** The domain serves the site's pages (ADR-022). */
export function domainActiveEmail(input: DomainEmailInput): EmailContent {
  const title = `${input.hostname} đã hoạt động`;
  const body = `Các trang đang live của ${input.siteName} mở được qua ${input.hostname}. Bạn có thể đặt tên miền này làm địa chỉ chính ở mục "Tên miền".`;
  return {
    subject: title,
    text: [body, '', input.domainsUrl].join('\n'),
    html: layout(title, `${paragraph(body)}${button(input.domainsUrl, 'Mở mục Tên miền')}`),
  };
}

/** The domain no longer points here; visitors following it get an error (ADR-022). */
export function domainLostEmail(input: DomainEmailInput): EmailContent {
  const title = `${input.hostname} đang không truy cập được`;
  const body = `Bản ghi DNS của ${input.hostname} không còn trỏ tới hệ thống, nên khách mở link tới ${input.siteName} qua tên miền này sẽ gặp lỗi. Các trang vẫn mở được ở địa chỉ mặc định.`;
  return {
    subject: title,
    text: [body, '', input.domainsUrl].join('\n'),
    html: layout(title, `${paragraph(body)}${button(input.domainsUrl, 'Xem cách sửa')}`),
  };
}

/** Its owner proved the domain is theirs from another site, which now has it (ADR-022). */
export function domainMovedEmail(input: DomainEmailInput): EmailContent {
  const title = `${input.hostname} đã chuyển khỏi ${input.siteName}`;
  const body = `Chủ tên miền ${input.hostname} đã xác minh quyền sở hữu bằng bản ghi TXT ở một site khác, nên tên miền không còn dùng cho ${input.siteName}. Các trang vẫn mở được ở địa chỉ mặc định.`;
  return {
    subject: title,
    text: [body, '', input.domainsUrl].join('\n'),
    html: layout(title, `${paragraph(body)}${button(input.domainsUrl, 'Mở mục Tên miền')}`),
  };
}

export interface ApprovalRequestEmailInput {
  requesterName: string;
  pageTitle: string;
  siteName: string;
  note: string;
  /** True when the sender asks again for a newer draft. */
  resent: boolean;
  /** The page in the editor; publishing still checks the approver's role. */
  pageUrl: string;
}

/** Tells Chủ sở hữu and Quản trị a page waits for their approval (ADR-023). */
export function approvalRequestEmail(input: ApprovalRequestEmailInput): EmailContent {
  const title = `${input.requesterName} ${input.resent ? 'gửi lại' : 'gửi'} yêu cầu xuất bản "${input.pageTitle}"`;
  const intro = `Trang "${input.pageTitle}" của ${input.siteName} đang chờ bạn duyệt.`;
  const note = input.note === '' ? null : `Ghi chú: ${input.note}`;
  const action =
    'Mở trang, xem trước và kiểm tra, rồi chọn "Duyệt và xuất bản" hoặc "Từ chối". Trang chỉ live khi bạn xuất bản.';
  return {
    subject: title,
    text: [intro, ...(note === null ? [] : ['', note]), '', action, input.pageUrl].join('\n'),
    html: layout(
      title,
      `${paragraph(intro)}${note === null ? '' : paragraph(note)}${button(input.pageUrl, 'Xem và duyệt')}${smallPrint(action)}`,
    ),
  };
}

export interface ApprovalPublishedEmailInput {
  pageTitle: string;
  publisherName: string;
  /** The publisher decides requests: they approved it. A Biên tập only published it. */
  approved: boolean;
  version: number;
  liveUrl: string;
}

/** Tells the sender their page went live (ADR-023). */
export function approvalPublishedEmail(input: ApprovalPublishedEmailInput): EmailContent {
  const title = `"${input.pageTitle}" đã được xuất bản`;
  const body = `${input.publisherName} đã ${input.approved ? 'duyệt và xuất bản' : 'xuất bản'} phiên bản v${input.version}. Khách truy cập đang thấy phiên bản mới.`;
  return {
    subject: title,
    text: [body, '', input.liveUrl].join('\n'),
    html: layout(title, `${paragraph(body)}${button(input.liveUrl, 'Mở trang live')}`),
  };
}

export interface ApprovalRejectedEmailInput {
  pageTitle: string;
  rejecterName: string;
  reason: string;
  pageUrl: string;
}

/** Tells the sender why their page was not published (ADR-023). */
export function approvalRejectedEmail(input: ApprovalRejectedEmailInput): EmailContent {
  const title = `Yêu cầu xuất bản "${input.pageTitle}" chưa được duyệt`;
  const body = `${input.rejecterName} chưa duyệt yêu cầu. Trang live giữ nguyên.`;
  const reason = `Lý do: ${input.reason}`;
  const next = 'Sửa bản nháp theo góp ý rồi gửi lại yêu cầu.';
  return {
    subject: title,
    text: [body, '', reason, '', next, input.pageUrl].join('\n'),
    html: layout(
      title,
      `${paragraph(body)}${paragraph(reason)}${paragraph(next)}${button(input.pageUrl, 'Mở trang')}`,
    ),
  };
}
