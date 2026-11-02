import type {
  AccessDecisionData,
  AccessRequestData,
  AccountExistsData,
  ApprovalPublishedData,
  ApprovalRejectedData,
  ApprovalRequestData,
  DomainEmailData,
  Email,
  LeadNotificationData,
  MemberInvitationData,
  PasswordResetData,
  RecipientConfirmationData,
  SignupConfirmationData,
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

/** An email as an SMTP server takes it, before it is addressed. */
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

function textLink(href: string, label: string): string {
  return `<p style="margin:0 0 16px;line-height:1.55"><a href="${escapeHtml(href)}" style="color:#4338ca;font-weight:600">${escapeHtml(label)}</a></p>`;
}

/** The link that confirms a sign-up's email (ADR-026). */
function signupConfirmation(data: SignupConfirmationData): RenderedEmail {
  const title = 'Xác nhận email để tạo workspace';
  const intro = `Email này vừa được dùng để đăng ký tài khoản và tạo workspace "${data.workspaceName}". Bấm nút dưới đây để xác nhận email và đặt mật khẩu; tài khoản và workspace được tạo ngay sau đó.`;
  const validity = `Link có hiệu lực ${data.validHours} giờ và chỉ dùng được một lần. Nếu bạn không đăng ký, hãy bỏ qua email này: tài khoản sẽ không được tạo.`;
  return {
    subject: title,
    text: [intro, '', `Xác nhận tại: ${data.confirmUrl}`, '', validity].join('\n'),
    html: layout(
      title,
      `${paragraph(intro)}${button(data.confirmUrl, 'Xác nhận và tạo workspace')}${smallPrint(validity)}`,
    ),
  };
}

/** The email signing up has an account already (ADR-026). */
function accountExists(data: AccountExistsData): RenderedEmail {
  const title = 'Email này đã có tài khoản';
  const intro =
    'Ai đó, có thể là bạn, vừa dùng email này để đăng ký. Email này đã có tài khoản nên không có tài khoản mới nào được tạo. Hãy đăng nhập bằng mật khẩu hiện có.';
  const ignore =
    'Nếu không phải bạn đăng ký, hãy bỏ qua email này: tài khoản của bạn không thay đổi.';
  return {
    subject: title,
    text: [
      intro,
      '',
      `Đăng nhập: ${data.loginUrl}`,
      `Quên mật khẩu: ${data.forgotUrl}`,
      '',
      ignore,
    ].join('\n'),
    html: layout(
      title,
      `${paragraph(intro)}${button(data.loginUrl, 'Đăng nhập')}${textLink(data.forgotUrl, 'Quên mật khẩu? Đặt lại mật khẩu')}${smallPrint(ignore)}`,
    ),
  };
}

/** The link that sets a new password (ADR-026). */
function passwordReset(data: PasswordResetData): RenderedEmail {
  const title = 'Đặt lại mật khẩu';
  const intro =
    'Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản dùng email này. Khi bạn đặt mật khẩu mới, mọi thiết bị đang đăng nhập sẽ bị đăng xuất.';
  const validity = `Link có hiệu lực ${data.validMinutes} phút và chỉ dùng được một lần. Nếu bạn không yêu cầu, hãy bỏ qua email này: mật khẩu giữ nguyên.`;
  return {
    subject: title,
    text: [intro, '', `Đặt lại mật khẩu tại: ${data.resetUrl}`, '', validity].join('\n'),
    html: layout(
      title,
      `${paragraph(intro)}${button(data.resetUrl, 'Đặt mật khẩu mới')}${smallPrint(validity)}`,
    ),
  };
}

/** Tells Chủ sở hữu a member asks for another role (ADR-021). */
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

/** The domain serves the site's pages (ADR-022). */
function domainActive(data: DomainEmailData): RenderedEmail {
  const title = `${data.hostname} đã hoạt động`;
  const body = `Các trang đang live của ${data.siteName} mở được qua ${data.hostname}. Bạn có thể đặt tên miền này làm địa chỉ chính ở mục "Tên miền".`;
  return {
    subject: title,
    text: [body, '', data.domainsUrl].join('\n'),
    html: layout(title, `${paragraph(body)}${button(data.domainsUrl, 'Mở mục Tên miền')}`),
  };
}

/** The domain no longer points here (ADR-022). */
function domainLost(data: DomainEmailData): RenderedEmail {
  const title = `${data.hostname} đang không truy cập được`;
  const body = `Bản ghi DNS của ${data.hostname} không còn trỏ tới hệ thống, nên khách mở link tới ${data.siteName} qua tên miền này sẽ gặp lỗi. Các trang vẫn mở được ở địa chỉ mặc định.`;
  return {
    subject: title,
    text: [body, '', data.domainsUrl].join('\n'),
    html: layout(title, `${paragraph(body)}${button(data.domainsUrl, 'Xem cách sửa')}`),
  };
}

/** Another site proved the domain is its own (ADR-022). */
function domainMoved(data: DomainEmailData): RenderedEmail {
  const title = `${data.hostname} đã chuyển khỏi ${data.siteName}`;
  const body = `Chủ tên miền ${data.hostname} đã xác minh quyền sở hữu bằng bản ghi TXT ở một site khác, nên tên miền không còn dùng cho ${data.siteName}. Các trang vẫn mở được ở địa chỉ mặc định.`;
  return {
    subject: title,
    text: [body, '', data.domainsUrl].join('\n'),
    html: layout(title, `${paragraph(body)}${button(data.domainsUrl, 'Mở mục Tên miền')}`),
  };
}

/** Tells Chủ sở hữu and Quản trị a page waits for their approval (ADR-023). */
function approvalRequest(data: ApprovalRequestData): RenderedEmail {
  const title = `${data.requesterName} ${data.resent ? 'gửi lại' : 'gửi'} yêu cầu xuất bản "${data.pageTitle}"`;
  const intro = `Trang "${data.pageTitle}" của ${data.siteName} đang chờ bạn duyệt.`;
  const note = data.note === null ? null : `Ghi chú: ${data.note}`;
  const action =
    'Mở trang, xem trước và kiểm tra, rồi chọn "Duyệt và xuất bản" hoặc "Từ chối". Trang chỉ live khi bạn xuất bản.';
  return {
    subject: title,
    text: [intro, ...(note === null ? [] : ['', note]), '', action, data.pageUrl].join('\n'),
    html: layout(
      title,
      `${paragraph(intro)}${note === null ? '' : paragraph(note)}${button(data.pageUrl, 'Xem và duyệt')}${smallPrint(action)}`,
    ),
  };
}

/** Tells the sender their page went live (ADR-023). */
function approvalPublished(data: ApprovalPublishedData): RenderedEmail {
  const title = `"${data.pageTitle}" đã được xuất bản`;
  const body = `${data.publisherName} đã ${data.approved ? 'duyệt và xuất bản' : 'xuất bản'} phiên bản v${data.version}. Khách truy cập đang thấy phiên bản mới.`;
  return {
    subject: title,
    text: [body, '', data.liveUrl].join('\n'),
    html: layout(title, `${paragraph(body)}${button(data.liveUrl, 'Mở trang live')}`),
  };
}

/** Tells the sender why their page was not published (ADR-023). */
function approvalRejected(data: ApprovalRejectedData): RenderedEmail {
  const title = `Yêu cầu xuất bản "${data.pageTitle}" chưa được duyệt`;
  const body = `${data.rejecterName} chưa duyệt yêu cầu. Trang live giữ nguyên.`;
  const reason = `Lý do: ${data.reason}`;
  const next = 'Sửa bản nháp theo góp ý rồi gửi lại yêu cầu.';
  return {
    subject: title,
    text: [body, '', reason, '', next, data.pageUrl].join('\n'),
    html: layout(
      title,
      `${paragraph(body)}${paragraph(reason)}${paragraph(next)}${button(data.pageUrl, 'Mở trang')}`,
    ),
  };
}

/**
 * The subject and both parts of an email, as SMTP sends it (ADR-018). plp-mailer renders the same
 * data with its own copy of these texts (ADR-029).
 */
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
    case 'signup-confirmation':
      return signupConfirmation(email.data);
    case 'account-exists':
      return accountExists(email.data);
    case 'password-reset':
      return passwordReset(email.data);
    case 'domain-active':
      return domainActive(email.data);
    case 'domain-lost':
      return domainLost(email.data);
    case 'domain-moved':
      return domainMoved(email.data);
    case 'approval-request':
      return approvalRequest(email.data);
    case 'approval-published':
      return approvalPublished(email.data);
    case 'approval-rejected':
      return approvalRejected(email.data);
  }
}
