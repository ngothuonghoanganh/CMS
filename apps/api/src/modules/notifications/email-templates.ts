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
