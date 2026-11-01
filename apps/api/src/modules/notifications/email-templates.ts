import type {
  AccessDecisionData,
  AccessRequestData,
  Email,
  LeadNotificationData,
  MemberInvitationData,
  RecipientConfirmationData,
} from './emails.js';

/** Text for HTML: every character with a meaning in markup is escaped. */
export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** An email as an SMTP server takes it. */
export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/** A simple layout every client renders: one column, inline styles, no images. */
function layout(title: string, body: string): string {
  return `<!doctype html><html lang="vi"><body style="margin:0;padding:24px;background:#f5f6f8;font-family:Arial,sans-serif;color:#15171c"><div style="max-width:560px;margin:0 auto;padding:24px;background:#ffffff;border-radius:12px"><h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(title)}</h1>${body}</div></body></html>`;
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:6px 12px 6px 0;color:#5e6573;vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td><td style="padding:6px 0;white-space:pre-wrap">${escapeHtml(value)}</td></tr>`;
}

/** The email confirmed addresses get for a new lead (ADR-018). */
function leadNotification(data: LeadNotificationData): RenderedEmail {
  const { lead } = data;
  const rows: Array<[string, string]> = [
    ['Họ và tên', lead.name],
    ['Số điện thoại', lead.phone],
    ...(lead.email === null ? [] : ([['Email', lead.email]] as Array<[string, string]>)),
    ...(lead.message === null ? [] : ([['Lời nhắn', lead.message]] as Array<[string, string]>)),
    ['Trang', `${data.pageTitle} (v${data.releaseVersion})`],
    ['Nguồn', lead.source],
    ['Lúc', `${lead.createdAt} (giờ Việt Nam)`],
  ];
  const footer = `Bạn nhận email này vì địa chỉ này đã được thêm vào "Nơi nhận lead" của ${data.siteName} và đã xác nhận.`;
  const subject = `[${data.siteName}] Lead mới: ${lead.name}`;
  const text = [
    `${data.siteName} vừa nhận một đăng ký mới.`,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    `Mở lead trong hộp thư: ${data.leadUrl}`,
    '',
    footer,
  ].join('\n');
  const html = layout(
    `Lead mới cho ${data.siteName}`,
    `<table style="border-collapse:collapse;font-size:14px;line-height:1.5">${rows
      .map(([label, value]) => row(label, value))
      .join(
        '',
      )}</table><p style="margin:20px 0"><a href="${escapeHtml(data.leadUrl)}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#4338ca;color:#ffffff;text-decoration:none;font-weight:600">Mở lead trong hộp thư</a></p><p style="margin:0;font-size:12px;color:#5e6573">${escapeHtml(footer)}</p>`,
  );
  return { subject, text, html };
}

/** The email that asks an address to confirm before it receives any lead (ADR-018). */
function recipientConfirmation(data: RecipientConfirmationData): RenderedEmail {
  const intro = `${data.invitedBy} đã thêm địa chỉ này vào "Nơi nhận lead" của ${data.siteName}. Sau khi bạn xác nhận, mỗi khi có khách gửi form trên các trang của ${data.siteName}, bạn sẽ nhận một email kèm thông tin của khách.`;
  const validity = `Liên kết có hiệu lực ${data.validDays} ngày. Nếu bạn không biết việc này, hãy bỏ qua email: địa chỉ sẽ không nhận thông tin nào.`;
  return {
    subject: `Xác nhận nhận lead của ${data.siteName}`,
    text: [intro, '', `Xác nhận tại: ${data.confirmUrl}`, '', validity].join('\n'),
    html: layout(
      `Xác nhận nhận lead của ${data.siteName}`,
      `<p style="margin:0 0 16px;line-height:1.55">${escapeHtml(intro)}</p><p style="margin:0 0 16px"><a href="${escapeHtml(data.confirmUrl)}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#4338ca;color:#ffffff;text-decoration:none;font-weight:600">Xác nhận nhận lead</a></p><p style="margin:0;font-size:12px;color:#5e6573">${escapeHtml(validity)}</p>`,
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

/** The invitation to join a workspace (board 15b, ADR-021). */
function memberInvitation(data: MemberInvitationData): RenderedEmail {
  const title = `${data.invitedBy} mời bạn vào ${data.workspaceName}`;
  const intro = `Bạn được mời làm ${data.roleLabel} trên ${data.scope} của ${data.workspaceName}.`;
  const validity = `Lời mời dùng được một lần, cho đúng địa chỉ email này, trong ${data.validDays} ngày. Không biết người mời? Bạn có thể bỏ qua email này, tài khoản sẽ không được tạo.`;
  return {
    subject: title,
    text: [intro, '', `Nhận lời mời tại: ${data.acceptUrl}`, '', validity].join('\n'),
    html: layout(
      title,
      `${paragraph(intro)}${button(data.acceptUrl, 'Nhận lời mời')}${smallPrint(validity)}`,
    ),
  };
}

/** Tells Chủ sở hữu a member asks for another role; the link only opens the request (ADR-021). */
function accessRequest(data: AccessRequestData): RenderedEmail {
  const title = `${data.requesterName} xin đổi quyền trong ${data.workspaceName}`;
  const intro = `${data.requesterName} (${data.requesterEmail}) đang là ${data.currentRole} và xin làm ${data.requestedRole} trên ${data.scope}.`;
  const note = data.note === null ? null : `Lời nhắn: ${data.note}`;
  const action =
    'Mở yêu cầu để chấp nhận, chỉnh vai trò và site trước khi lưu, hoặc từ chối. Quyền chỉ đổi khi bạn lưu trên màn Thành viên.';
  return {
    subject: title,
    text: [intro, ...(note === null ? [] : ['', note]), '', action, data.reviewUrl].join('\n'),
    html: layout(
      title,
      `${paragraph(intro)}${note === null ? '' : paragraph(note)}${button(data.reviewUrl, 'Xem yêu cầu')}${smallPrint(action)}`,
    ),
  };
}

/** Tells the member how Chủ sở hữu decided their request (ADR-021). */
function accessDecision(data: AccessDecisionData): RenderedEmail {
  const title = data.accepted
    ? `Yêu cầu đổi quyền trong ${data.workspaceName} đã được chấp nhận`
    : `Yêu cầu đổi quyền trong ${data.workspaceName} chưa được chấp nhận`;
  const body = data.accepted
    ? `Bạn là ${data.roleLabel} trên ${data.scope}. Quyền mới có hiệu lực ngay.`
    : 'Chủ sở hữu đã từ chối yêu cầu. Quyền của bạn giữ nguyên; bạn có thể gửi yêu cầu khác.';
  return {
    subject: title,
    text: [body, '', data.openUrl].join('\n'),
    html: layout(title, `${paragraph(body)}${button(data.openUrl, `Mở ${data.workspaceName}`)}`),
  };
}

/** The subject and both parts of an email, as SMTP sends it (ADR-018, ADR-023). */
export function renderEmail(email: Email): RenderedEmail {
  switch (email.template) {
    case 'lead-notification':
      return leadNotification(email.data);
    case 'recipient-confirmation':
      return recipientConfirmation(email.data);
    case 'member-invitation':
      return memberInvitation(email.data);
    case 'access-request':
      return accessRequest(email.data);
    case 'access-decision':
      return accessDecision(email.data);
  }
}
