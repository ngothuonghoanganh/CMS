import type {
  AccessDecisionData,
  AccessRequestData,
  AccountExistsData,
  ApprovalPublishedData,
  ApprovalRejectedData,
  AutomationNoticeData,
  ApprovalRequestData,
  BillingChargeFailedData,
  BillingExpiringSoonData,
  BillingReadOnlyData,
  BillingReceiptData,
  BillingTransferDueData,
  BillingTrialEndingData,
  DomainEmailData,
  Email,
  LeadNotificationData,
  MarketplaceReceiptData,
  MarketplaceSuggestionData,
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

/** An automation's internal email (ADR-034): who it is about, and the way to their profile. */
function automationNotice(data: AutomationNoticeData): RenderedEmail {
  const body = [
    `Automation "${data.automationName}" của ${data.siteName} gửi thư này về khách ${data.contactName}.`,
    data.pageTitle === null ? null : `Trang nguồn: ${data.pageTitle}.`,
    `Người phụ trách: ${data.ownerName ?? 'chưa giao'}.`,
  ].filter((line): line is string => line !== null);
  const action = 'Mở hồ sơ để xem số điện thoại, email và các lần liên hệ.';
  return {
    subject: data.subject,
    text: [...body, '', action, data.profileUrl].join('\n'),
    html: layout(
      data.subject,
      `${body.map(paragraph).join('')}${button(data.profileUrl, 'Mở hồ sơ')}${smallPrint(action)}`,
    ),
  };
}

/** Why the Chủ sở hữu, and only they, get the emails of the plan (ADR-035). */
function ownerFooter(workspaceName: string): string {
  return `Bạn nhận email này vì là Chủ sở hữu của ${workspaceName}.`;
}

/** "Dùng thử sắp hết" (ADR-035, T3): what the end of the trial charges, or how to keep going. */
function billingTrialEnding(data: BillingTrialEndingData): RenderedEmail {
  const title = `Dùng thử ${data.workspaceName} còn ${data.daysLeft} ngày`;
  const body =
    data.charge === null
      ? `Thời gian dùng thử Gói ${data.planName} kết thúc ngày ${data.trialEndsOn}. Thêm thẻ thanh toán hoặc chọn "Thanh toán ngay" để dùng tiếp. Nếu không, workspace chuyển sang chỉ đọc: trang live và form vẫn chạy nhưng không sửa hay xuất bản được.`
      : `Thời gian dùng thử Gói ${data.planName} kết thúc ngày ${data.trialEndsOn}. Hôm đó hệ thống tự trừ ${data.charge.amount} / ${data.charge.cycle} vào thẻ ${data.charge.card} để dùng tiếp; bạn không cần làm gì thêm.`;
  const footer = ownerFooter(data.workspaceName);
  return {
    subject: title,
    text: [body, '', `Xem gói: ${data.billingUrl}`, '', footer].join('\n'),
    html: layout(
      title,
      `${paragraph(body)}${button(data.billingUrl, 'Xem gói')}${smallPrint(footer)}`,
    ),
  };
}

/** A charge of the plan did not go through (ADR-035, T3): why, the next try, the grace. */
function billingChargeFailed(data: BillingChargeFailedData): RenderedEmail {
  const title = `Chưa gia hạn được ${data.workspaceName}`;
  const card = data.card === null ? '' : ` (thẻ ${data.card})`;
  const what = `Hệ thống chưa trừ được ${data.amount} cho Gói ${data.planName}, hóa đơn ${data.invoiceNumber}: ${data.reason}${card}.`;
  const next =
    data.nextRetryOn === null
      ? 'Hệ thống không tự thử lại nữa. Hãy đổi thẻ rồi bấm "Thanh toán lại", hoặc chuyển khoản.'
      : `Hệ thống tự thử lại ngày ${data.nextRetryOn}. Bạn cũng có thể đổi thẻ, thanh toán lại hoặc chuyển khoản ngay.`;
  const grace = `Workspace vẫn dùng bình thường tới ${data.graceEndsOn}, sau đó chuyển sang chỉ đọc cho tới khi được thanh toán. Trang live và form vẫn chạy.`;
  const footer = ownerFooter(data.workspaceName);
  return {
    subject: title,
    text: [what, '', next, '', grace, '', `Thanh toán: ${data.paymentsUrl}`, '', footer].join('\n'),
    html: layout(
      title,
      `${paragraph(what)}${paragraph(next)}${paragraph(grace)}${button(data.paymentsUrl, 'Thanh toán')}${smallPrint(footer)}`,
    ),
  };
}

/** "Sắp hết hạn" (ADR-035, T3): the period ends soon and cannot renew by itself. */
function billingExpiringSoon(data: BillingExpiringSoonData): RenderedEmail {
  const title = `Gói của ${data.workspaceName} hết hạn ngày ${data.periodEndsOn}`;
  const body = `Kỳ hiện tại của Gói ${data.planName} kết thúc ngày ${data.periodEndsOn} (còn ${data.daysLeft} ngày) và chưa tự gia hạn được: ${data.reason}.`;
  const action =
    'Thêm hoặc cập nhật thẻ trước ngày đó để không bị gián đoạn. Bạn cũng có thể chuyển khoản khi hóa đơn kỳ mới được tạo.';
  const footer = ownerFooter(data.workspaceName);
  return {
    subject: title,
    text: [body, '', action, '', `Thanh toán: ${data.paymentsUrl}`, '', footer].join('\n'),
    html: layout(
      title,
      `${paragraph(body)}${paragraph(action)}${button(data.paymentsUrl, 'Cập nhật thanh toán')}${smallPrint(footer)}`,
    ),
  };
}

/** The workspace turned read-only (ADR-035, T3): why, and that nothing is lost. */
function billingReadOnly(data: BillingReadOnlyData): RenderedEmail {
  const title = `${data.workspaceName} đã chuyển sang chế độ chỉ đọc`;
  const body = `${data.reason} Trang live và form vẫn chạy, lead mới vẫn được nhận, nhưng không sửa hay xuất bản được.`;
  const next = 'Chọn gói và thanh toán để dùng lại đầy đủ. Không dữ liệu nào bị xóa.';
  const footer = ownerFooter(data.workspaceName);
  return {
    subject: title,
    text: [body, '', next, '', `Xem gói: ${data.billingUrl}`, '', footer].join('\n'),
    html: layout(
      title,
      `${paragraph(body)}${paragraph(next)}${button(data.billingUrl, 'Xem gói')}${smallPrint(footer)}`,
    ),
  };
}

/** The receipt of a paid invoice (ADR-035, T3); not an electronic VAT invoice (§6). */
function billingReceipt(data: BillingReceiptData): RenderedEmail {
  const title = `Đã thanh toán ${data.amount}`;
  const rows: Array<[string, string]> = [
    ['Hóa đơn', data.invoiceNumber],
    ['Nội dung', `Gói ${data.planName} · ${data.period}`],
    ['Số tiền', data.amount],
    ['Ngày thanh toán', data.paidOn],
    ['Phương thức', data.method],
  ];
  const note = 'Đây là biên nhận thanh toán, không phải hóa đơn điện tử.';
  const footer = ownerFooter(data.workspaceName);
  return {
    subject: `Biên nhận ${data.invoiceNumber} · ${data.workspaceName}`,
    text: [
      ...rows.map(([label, value]) => `${label}: ${value}`),
      '',
      `Xem biên nhận: ${data.receiptUrl}`,
      '',
      note,
      footer,
    ].join('\n'),
    html: layout(
      title,
      `<table style="border-collapse:collapse;font-size:14px;line-height:1.5;margin:0 0 16px">${rows
        .map(([label, value]) => row(label, value))
        .join(
          '',
        )}</table>${button(data.receiptUrl, 'Xem biên nhận')}${smallPrint(`${note} ${footer}`)}`,
    ),
  };
}

/**
 * The next period's invoice to pay by bank transfer (ADR-035, T4): when it is made, and on its due
 * day if unpaid. The bank details are written out; the QR code is on board 29, since many mail
 * clients block images.
 */
function billingTransferDue(data: BillingTransferDueData): RenderedEmail {
  const issued = !data.dueToday;
  const title = issued
    ? `Hóa đơn kỳ mới của ${data.workspaceName}: chuyển khoản trước ${data.dueOn}`
    : `Hôm nay là hạn chuyển khoản gói của ${data.workspaceName}`;
  const what = issued
    ? `Gói ${data.planName} của ${data.workspaceName} gia hạn bằng chuyển khoản. Hóa đơn ${data.invoiceNumber} · ${data.amount} cho kỳ ${data.period} (theo ${data.cycle}). Hạn chuyển khoản: ${data.dueOn}. Chuyển khoản trước hạn thì kỳ mới bắt đầu đúng ngày ${data.dueOn}, không mất ngày nào.`
    : `Hệ thống chưa nhận được chuyển khoản cho hóa đơn ${data.invoiceNumber} · ${data.amount} (Gói ${data.planName}, kỳ ${data.period}), hạn hôm nay ${data.dueOn}.`;
  const replaced =
    data.replacesInvoiceNumber === null
      ? null
      : `Hóa đơn này thay hóa đơn ${data.replacesInvoiceNumber} sau khi gói thay đổi. Đừng chuyển khoản cho hóa đơn ${data.replacesInvoiceNumber} nữa.`;
  const rows: Array<[string, string]> = [
    ['Ngân hàng', data.bankName],
    ['Số tài khoản', data.accountNumber],
    ['Tên tài khoản', data.accountName],
    ['Số tiền', data.amount],
    ['Nội dung', data.content],
  ];
  const content = 'Ghi đúng nội dung chuyển khoản để hệ thống tự xác nhận.';
  const grace = issued
    ? `Nếu tới hạn chưa nhận được tiền, workspace vẫn dùng bình thường tới ${data.graceEndsOn}, sau đó chuyển sang chỉ đọc cho tới khi được thanh toán. Trang live và form vẫn chạy.`
    : `Workspace vẫn dùng bình thường tới ${data.graceEndsOn}, sau đó chuyển sang chỉ đọc cho tới khi được thanh toán. Trang live và form vẫn chạy.`;
  const card = 'Mã QR có ở "Thanh toán & hóa đơn", cùng với cách thanh toán bằng thẻ thay thế.';
  const footer = ownerFooter(data.workspaceName);
  const intro = [what, replaced].filter((line): line is string => line !== null);
  return {
    subject: title,
    text: [
      ...intro,
      '',
      ...rows.map(([label, value]) => `${label}: ${value}`),
      content,
      '',
      grace,
      '',
      card,
      `Thanh toán: ${data.paymentsUrl}`,
      '',
      footer,
    ].join('\n'),
    html: layout(
      title,
      `${intro.map(paragraph).join('')}<table style="border-collapse:collapse;font-size:14px;line-height:1.5;margin:0 0 16px">${rows
        .map(([label, value]) => row(label, value))
        .join(
          '',
        )}</table>${paragraph(content)}${paragraph(grace)}${button(data.paymentsUrl, 'Xem mã QR và thanh toán')}${smallPrint(`${card} ${footer}`)}`,
    ),
  };
}

/** The receipt of a paid marketplace invoice (ADR-036, MP3); not an electronic VAT invoice. */
function marketplaceReceipt(data: MarketplaceReceiptData): RenderedEmail {
  const title = `Đã thanh toán ${data.amount}`;
  const rows: Array<[string, string]> = [
    ['Hóa đơn', data.invoiceNumber],
    ['Nội dung', `Mẫu “${data.itemName}” · v${data.version} · Marketplace`],
    ['Số tiền', data.amount],
    ['Ngày thanh toán', data.paidOn],
    ['Phương thức', data.method],
  ];
  const use = `Mẫu đã có trong Templates của ${data.workspaceName}, dùng được cho mọi site trong workspace. Tạo trang từ mẫu tại đây:`;
  const note = 'Đây là biên nhận thanh toán, không phải hóa đơn điện tử.';
  const footer = ownerFooter(data.workspaceName);
  return {
    subject: `Biên nhận ${data.invoiceNumber} · Mẫu “${data.itemName}”`,
    text: [
      ...rows.map(([label, value]) => `${label}: ${value}`),
      '',
      `Xem biên nhận: ${data.receiptUrl}`,
      '',
      use,
      data.templateUrl,
      '',
      note,
      footer,
    ].join('\n'),
    html: layout(
      title,
      `<table style="border-collapse:collapse;font-size:14px;line-height:1.5;margin:0 0 16px">${rows
        .map(([label, value]) => row(label, value))
        .join(
          '',
        )}</table>${button(data.receiptUrl, 'Xem biên nhận')}${paragraph(use)}${button(data.templateUrl, 'Tạo trang từ mẫu')}${smallPrint(`${note} ${footer}`)}`,
    ),
  };
}

/** A member asks Chủ sở hữu to buy an item (ADR-036, MP3): who, what, the price, where to buy. */
function marketplaceSuggestion(data: MarketplaceSuggestionData): RenderedEmail {
  const title = `${data.memberName} đề xuất mua mẫu “${data.itemName}”`;
  const body = `${data.memberName} muốn dùng mẫu “${data.itemName}” trên Marketplace cho ${data.workspaceName}. Giá ${data.price} (đã gồm VAT), mua một lần và dùng được cho mọi site trong workspace.`;
  const action =
    'Chỉ Chủ sở hữu mua được mẫu trả phí. Mở mẫu để xem trước và mua nếu bạn đồng ý; nếu không, bạn không cần làm gì.';
  const footer = ownerFooter(data.workspaceName);
  return {
    subject: title,
    text: [body, '', action, data.itemUrl, '', footer].join('\n'),
    html: layout(
      title,
      `${paragraph(body)}${paragraph(action)}${button(data.itemUrl, 'Xem mẫu')}${smallPrint(footer)}`,
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
    case 'automation-notice':
      return automationNotice(email.data);
    case 'billing-trial-ending':
      return billingTrialEnding(email.data);
    case 'billing-charge-failed':
      return billingChargeFailed(email.data);
    case 'billing-expiring-soon':
      return billingExpiringSoon(email.data);
    case 'billing-read-only':
      return billingReadOnly(email.data);
    case 'billing-receipt':
      return billingReceipt(email.data);
    case 'billing-transfer-due':
      return billingTransferDue(email.data);
    case 'marketplace-receipt':
      return marketplaceReceipt(email.data);
    case 'marketplace-suggestion':
      return marketplaceSuggestion(email.data);
  }
}
