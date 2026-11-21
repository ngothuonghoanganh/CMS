import { describe, expect, it } from 'vitest';
import { MAIL_TEMPLATES, templateDataProblems } from '../../../test/mail-templates.js';
import {
  accessDecisionEmail,
  accessRequestEmail,
  accountExistsEmail,
  approvalPublishedEmail,
  approvalRejectedEmail,
  automationNoticeEmail,
  approvalRequestEmail,
  billingChargeFailedEmail,
  billingExpiringSoonEmail,
  billingReadOnlyEmail,
  billingReceiptEmail,
  billingTrialEndingEmail,
  domainActiveEmail,
  domainLostEmail,
  domainMovedEmail,
  type KeyedEmail,
  type LeadEmailInput,
  leadNotificationEmail,
  marketplaceReceiptEmail,
  marketplaceSuggestionEmail,
  memberInvitationEmail,
  passwordResetEmail,
  recipientConfirmationEmail,
  signupConfirmationEmail,
} from './emails.js';
import { mailerRequestOf } from './sqs-email-sender.js';

const ID = '6724f0c2a1b2c3d4e5f60789';
const OTHER_ID = '6724f0c2a1b2c3d4e5f6078a';
const AT = new Date('2026-11-08T09:42:07.123Z');
const LATER = new Date(AT.getTime() + 60_000);
const TOKEN = 'secret-token-abc';

const lead: LeadEmailInput['lead'] = {
  name: 'Nguyễn Thu Hà',
  phone: '+84901234567',
  email: 'thuha@example.com',
  message: 'Gọi sau 18h & cuối tuần',
  source: { source: 'facebook', medium: 'cpc', campaign: 'uu-dai-t11' },
  // 16:42:07 on 24 October 2026 in Vietnam.
  createdAt: new Date('2026-10-24T09:42:07.000Z'),
};

function leadEmail(overrides: Partial<typeof lead> = {}, leadId = ID): KeyedEmail {
  return leadNotificationEmail({
    leadId,
    siteName: 'Nha khoa Smile Care',
    pageTitle: 'Ưu đãi niềng răng',
    releaseVersion: 12,
    lead: { ...lead, ...overrides },
    leadUrl: `http://localhost:3100/sites/s1/leads?lead=${leadId}&range=all`,
  });
}

function confirmation(linkExpiresAt = AT): KeyedEmail {
  return recipientConfirmationEmail({
    recipientId: ID,
    linkExpiresAt,
    siteName: 'Nha khoa Smile Care',
    invitedBy: 'Ngọc Anh',
    confirmUrl: `http://localhost:3100/lead-recipients/confirm#site=${ID}&token=${TOKEN}`,
    validDays: 7,
  });
}

function invitation(linkExpiresAt = AT): KeyedEmail {
  return memberInvitationEmail({
    invitationId: ID,
    linkExpiresAt,
    workspaceName: 'Mây Xanh Agency',
    invitedBy: 'Ngọc Anh',
    roleLabel: 'Biên tập viên',
    scope: 'site Nha khoa Smile Care',
    acceptUrl: `http://may-xanh.localhost:3100/invite#token=${TOKEN}`,
    validDays: 7,
  });
}

function accessRequest(note: string): KeyedEmail {
  return accessRequestEmail({
    requestId: ID,
    workspaceName: 'Mây Xanh Agency',
    requesterName: 'Thu Trần',
    requesterEmail: 'thu.tran@example.com',
    currentRole: 'Cộng tác viên',
    requestedRole: 'Biên tập viên',
    scope: 'các site hiện tại',
    note,
    reviewUrl: `http://localhost:3100/workspaces/w1/members?request=${ID}`,
  });
}

const decision = {
  requestId: ID,
  workspaceName: 'Mây Xanh Agency',
  openUrl: 'http://localhost:3100/',
};

function signup(linkExpiresAt = AT): KeyedEmail {
  return signupConfirmationEmail({
    signupId: ID,
    linkExpiresAt,
    workspaceName: 'Mây Xanh Agency',
    confirmUrl: `http://localhost:3100/signup/verify#token=${TOKEN}`,
    validHours: 24,
  });
}

function accountExists(requestedAt = AT): KeyedEmail {
  return accountExistsEmail({
    userId: ID,
    requestedAt,
    loginUrl: 'http://localhost:3100/login',
    forgotUrl: 'http://localhost:3100/forgot-password',
  });
}

function passwordReset(linkExpiresAt = AT): KeyedEmail {
  return passwordResetEmail({
    userId: ID,
    linkExpiresAt,
    resetUrl: `http://localhost:3100/reset-password#token=${TOKEN}`,
    validMinutes: 60,
  });
}

const domain = {
  domainId: ID,
  hostname: 'go.smilecare.vn',
  siteName: 'Nha khoa Smile Care',
  domainsUrl: `http://localhost:3100/sites/${ID}/domain`,
};

function approvalRequest(note: string, sentAt = AT, resent = false): KeyedEmail {
  return approvalRequestEmail({
    approvalId: ID,
    sentAt,
    requesterName: 'Lê Hoàng Nam',
    pageTitle: 'Ưu đãi niềng răng',
    siteName: 'Nha khoa Smile Care',
    note,
    resent,
    pageUrl: `http://localhost:3100/sites/${ID}/pages/${OTHER_ID}/edit`,
  });
}

function approvalPublished(approved: boolean): KeyedEmail {
  return approvalPublishedEmail({
    approvalId: ID,
    pageTitle: 'Ưu đãi niềng răng',
    publisherName: 'Trần Minh Thư',
    approved,
    version: 4,
    liveUrl: 'http://smile-care.localhost:3101/uu-dai',
  });
}

const approvalRejected = approvalRejectedEmail({
  approvalId: ID,
  pageTitle: 'Ưu đãi niềng răng',
  rejecterName: 'Trần Minh Thư',
  reason: 'Giá chưa đúng',
  pageUrl: `http://localhost:3100/sites/${ID}/pages/${OTHER_ID}/edit`,
});

const automationNotice = automationNoticeEmail({
  runId: ID,
  step: 1,
  siteName: 'Nha khoa Smile Care',
  automationName: 'Nhắc khi lead chưa được gọi',
  subject: 'Nguyễn Thu Trang chưa được gọi sau 15 phút',
  contactName: 'Nguyễn Thu Trang',
  pageTitle: null,
  ownerName: null,
  profileUrl: `http://localhost:3100/sites/${ID}/contacts/${OTHER_ID}`,
});

/*
 * The emails of the plan (ADR-035, T3), as the billing job and the payments send them.
 */
const BILLING = {
  workspaceId: ID,
  workspaceName: 'Mây Xanh Agency',
  billingUrl: `http://localhost:3100/workspaces/${ID}/billing`,
  paymentsUrl: `http://localhost:3100/workspaces/${ID}/billing/payments`,
};

function trialEnding(charge: boolean): KeyedEmail {
  return billingTrialEndingEmail({
    workspaceId: BILLING.workspaceId,
    trialEndsAt: AT,
    workspaceName: BILLING.workspaceName,
    planName: 'Agency',
    trialEndsOn: '08/11/2026',
    daysLeft: 3,
    charge: charge ? { amount: '599.000 ₫', cycle: 'tháng', card: 'Visa •••• 4242' } : null,
    billingUrl: BILLING.billingUrl,
  });
}

function chargeFailed(card: string | null, nextRetryOn: string | null): KeyedEmail {
  return billingChargeFailedEmail({
    invoiceId: OTHER_ID,
    attempt: 2,
    workspaceName: BILLING.workspaceName,
    planName: 'Doanh nghiệp',
    invoiceNumber: 'HD-2026-000123',
    amount: '1.490.000 ₫',
    reason: card === null ? 'Chưa có thẻ thanh toán' : 'Thẻ không đủ hạn mức',
    card,
    nextRetryOn,
    graceEndsOn: '08/12/2026',
    paymentsUrl: BILLING.paymentsUrl,
  });
}

const expiringSoon = billingExpiringSoonEmail({
  workspaceId: BILLING.workspaceId,
  periodEnd: AT,
  workspaceName: BILLING.workspaceName,
  planName: 'Agency',
  periodEndsOn: '01/12/2026',
  daysLeft: 7,
  reason: 'Thẻ Visa •••• 4242 hết hạn 11/2026, trước ngày gia hạn',
  paymentsUrl: BILLING.paymentsUrl,
});

const readOnly = billingReadOnlyEmail({
  workspaceId: BILLING.workspaceId,
  since: AT,
  workspaceName: BILLING.workspaceName,
  reason: 'Gói chưa được thanh toán và đã hết thời gian ân hạn.',
  billingUrl: BILLING.billingUrl,
});

function receipt(method: string): KeyedEmail {
  return billingReceiptEmail({
    invoiceId: OTHER_ID,
    workspaceName: BILLING.workspaceName,
    invoiceNumber: 'HD-2026-000123',
    planName: 'Doanh nghiệp',
    period: '01/11/2026 – 01/12/2026',
    amount: '1.490.000 ₫',
    paidOn: '01/11/2026',
    method,
    receiptUrl: `http://localhost:3100/workspaces/${ID}/billing/receipts/${OTHER_ID}`,
  });
}

function marketplaceReceipt(method: string): KeyedEmail {
  return marketplaceReceiptEmail({
    invoiceId: OTHER_ID,
    workspaceName: BILLING.workspaceName,
    invoiceNumber: 'HD-2026-000124',
    itemName: 'Mở bán dự án căn hộ',
    version: 2,
    amount: '499.000 ₫',
    paidOn: '01/11/2026',
    method,
    receiptUrl: `http://localhost:3100/workspaces/${ID}/billing/receipts/${OTHER_ID}`,
    templateUrl: `http://localhost:3100/workspaces/${ID}/templates/mp-mo-ban-du-an-can-ho`,
  });
}

const SUGGESTION = { workspaceId: ID, userId: OTHER_ID, itemId: 'mp-mo-ban-du-an-can-ho' };

const marketplaceSuggestion = marketplaceSuggestionEmail({
  ...SUGGESTION,
  workspaceName: BILLING.workspaceName,
  memberName: 'Lan Hương',
  itemName: 'Mở bán dự án căn hộ',
  price: '499.000 ₫',
  itemUrl: `http://localhost:3100/workspaces/${ID}/marketplace/mp-mo-ban-du-an-can-ho`,
});

/** Every email the API can send, in each shape its data can take. */
const EVERY_EMAIL: Array<[string, KeyedEmail]> = [
  ['automation-notice without a page or an owner', automationNotice],
  ['billing-trial-ending with the card that pays', trialEnding(true)],
  ['billing-trial-ending without a card', trialEnding(false)],
  ['billing-charge-failed with a retry to come', chargeFailed('Visa •••• 9995', '03/12/2026')],
  ['billing-charge-failed without a card or a retry', chargeFailed(null, null)],
  ['billing-expiring-soon', expiringSoon],
  ['billing-read-only', readOnly],
  ['billing-receipt of a card', receipt('Thẻ Visa •••• 4242')],
  ['billing-receipt of a transfer', receipt('Chuyển khoản')],
  ['marketplace-receipt of a card', marketplaceReceipt('Thẻ Visa •••• 4242')],
  ['marketplace-receipt of a transfer', marketplaceReceipt('Chuyển khoản')],
  ['marketplace-suggestion', marketplaceSuggestion],
  ['lead-notification', leadEmail()],
  [
    'lead-notification without email, message or campaign',
    leadEmail({
      email: null,
      message: null,
      source: { source: '(direct)', medium: '(none)', campaign: null },
    }),
  ],
  ['recipient-confirmation', confirmation()],
  ['member-invitation', invitation()],
  ['access-request with a note', accessRequest('Em cần sửa trang ưu đãi')],
  ['access-request without a note', accessRequest('')],
  [
    'access-decision accepted',
    accessDecisionEmail({
      ...decision,
      accepted: true,
      roleLabel: 'Biên tập viên',
      scope: 'toàn workspace',
    }),
  ],
  ['access-decision declined', accessDecisionEmail({ ...decision, accepted: false })],
  ['signup-confirmation', signup()],
  ['account-exists', accountExists()],
  ['password-reset', passwordReset()],
  ['domain-active', domainActiveEmail(domain)],
  ['domain-lost', domainLostEmail({ ...domain, lostSince: AT })],
  ['domain-moved', domainMovedEmail(domain)],
  ['approval-request with a note', approvalRequest('Đã đổi giá')],
  ['approval-request sent again without a note', approvalRequest('', AT, true)],
  ['approval-published, approved', approvalPublished(true)],
  ['approval-published by a Biên tập', approvalPublished(false)],
  ['approval-rejected', approvalRejected],
];

/** The data of each email against the template's schema.json in plp-mailer (ADR-029). */
describe('the data of every email', () => {
  it('covers every template plp-mailer has for the API', () => {
    expect(new Set(EVERY_EMAIL.map(([, email]) => email.template))).toEqual(
      new Set(MAIL_TEMPLATES),
    );
  });

  it.each(EVERY_EMAIL)('%s matches the schema of its template', (_name, email) => {
    expect(templateDataProblems(email.template, email.data)).toEqual([]);
  });

  it.each(EVERY_EMAIL)('%s makes a request plp-mailer takes', (_name, email) => {
    expect(mailerRequestOf({ to: ['nhan@example.com'], ...email })).toEqual({
      template: email.template,
      to: ['nhan@example.com'],
      data: email.data,
      idempotencyKey: email.idempotencyKey,
    });
  });

  it.each(EVERY_EMAIL)('%s has a key plp-mailer takes, without the token', (_name, email) => {
    expect(email.idempotencyKey).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
    expect(email.idempotencyKey.startsWith(`${email.template}:`)).toBe(true);
    expect(email.idempotencyKey).not.toContain(TOKEN);
  });

  it('is checked for real: the schemas refuse data plp-mailer could not render', () => {
    expect(
      templateDataProblems('access-decision', {
        workspaceName: 'Mây Xanh Agency',
        accepted: true,
        openUrl: 'http://localhost:3100/',
      }),
    ).toEqual([
      "/ must have required property 'roleLabel'",
      "/ must have required property 'scope'",
      '/ must match "then" schema',
    ]);
    expect(
      templateDataProblems('recipient-confirmation', {
        ...confirmation().data,
        confirmUrl: 'javascript:alert(1)',
      }),
    ).toEqual(['/confirmUrl must match format "http-url"']);
    expect(templateDataProblems('access-request', { ...accessRequest('').data, extra: 1 })).toEqual(
      ['/ must NOT have additional properties'],
    );
    expect(
      templateDataProblems('approval-published', { ...approvalPublished(true).data, version: 0 }),
    ).toEqual(['/version must be >= 1']);
  });
});

describe('leadNotificationEmail', () => {
  it('formats the lead for display: the phone, the source with its campaign, Vietnam time', () => {
    expect(leadEmail()).toEqual({
      template: 'lead-notification',
      idempotencyKey: `lead-notification:${ID}`,
      data: {
        siteName: 'Nha khoa Smile Care',
        pageTitle: 'Ưu đãi niềng răng',
        releaseVersion: 12,
        lead: {
          name: 'Nguyễn Thu Hà',
          phone: '0901 234 567',
          email: 'thuha@example.com',
          message: 'Gọi sau 18h & cuối tuần',
          source: 'facebook / cpc / uu-dai-t11',
          createdAt: '2026-10-24 16:42:07',
        },
        leadUrl: `http://localhost:3100/sites/s1/leads?lead=${ID}&range=all`,
      },
    });
  });

  it('keeps one key per lead, so a retry or "Gửi lại" never sends a second email', () => {
    expect(leadEmail().idempotencyKey).toBe(leadEmail({ name: 'Thu Hà' }).idempotencyKey);
    expect(leadEmail({}, OTHER_ID).idempotencyKey).toBe(`lead-notification:${OTHER_ID}`);
  });
});

describe('links that "Gửi lại" renews', () => {
  it('give each link its own key, of its record and expiry', () => {
    expect(confirmation().idempotencyKey).toBe(`recipient-confirmation:${ID}:${AT.getTime()}`);
    expect(invitation().idempotencyKey).toBe(`member-invitation:${ID}:${AT.getTime()}`);
    expect(signup().idempotencyKey).toBe(`signup-confirmation:${ID}:${AT.getTime()}`);
    expect(passwordReset().idempotencyKey).toBe(`password-reset:${ID}:${AT.getTime()}`);
    for (const renew of [confirmation, invitation, signup, passwordReset]) {
      expect(renew(LATER).idempotencyKey).not.toBe(renew(AT).idempotencyKey);
    }
  });

  it('give every sign-up of an email with an account its own email', () => {
    expect(accountExists().idempotencyKey).toBe(`account-exists:${ID}:${AT.getTime()}`);
    expect(accountExists(LATER).idempotencyKey).not.toBe(accountExists().idempotencyKey);
  });
});

describe('access request emails', () => {
  it('send a missing note as null', () => {
    expect(accessRequest('').data).toMatchObject({ note: null });
    expect(accessRequest('Cần gấp').data).toMatchObject({ note: 'Cần gấp' });
  });

  it('key the request and its decision apart, each once per request', () => {
    expect(accessRequest('').idempotencyKey).toBe(`access-request:${ID}`);
    expect(accessDecisionEmail({ ...decision, accepted: false }).idempotencyKey).toBe(
      `access-decision:${ID}`,
    );
  });

  it('leave the role and sites out of a declined decision', () => {
    expect(accessDecisionEmail({ ...decision, accepted: false }).data).toEqual({
      workspaceName: 'Mây Xanh Agency',
      accepted: false,
      openUrl: 'http://localhost:3100/',
    });
  });
});

describe('domain emails', () => {
  it('key "active" and "moved" once per domain, and each loss apart', () => {
    expect(domainActiveEmail(domain).idempotencyKey).toBe(`domain-active:${ID}`);
    expect(domainMovedEmail(domain).idempotencyKey).toBe(`domain-moved:${ID}`);
    expect(domainLostEmail({ ...domain, lostSince: AT }).idempotencyKey).toBe(
      `domain-lost:${ID}:${AT.getTime()}`,
    );
    expect(domainLostEmail({ ...domain, lostSince: LATER }).idempotencyKey).not.toBe(
      domainLostEmail({ ...domain, lostSince: AT }).idempotencyKey,
    );
    expect(domainActiveEmail(domain).data).toEqual({
      hostname: 'go.smilecare.vn',
      siteName: 'Nha khoa Smile Care',
      domainsUrl: `http://localhost:3100/sites/${ID}/domain`,
    });
  });
});

describe('approval emails', () => {
  it('key each sending of a request apart, and its outcome once', () => {
    expect(approvalRequest('').idempotencyKey).toBe(`approval-request:${ID}:${AT.getTime()}`);
    expect(approvalRequest('', LATER, true).idempotencyKey).not.toBe(
      approvalRequest('').idempotencyKey,
    );
    expect(approvalPublished(true).idempotencyKey).toBe(`approval-published:${ID}`);
    expect(approvalRejected.idempotencyKey).toBe(`approval-rejected:${ID}`);
  });

  it('send a missing note as null', () => {
    expect(approvalRequest('').data).toMatchObject({ note: null, resent: false });
    expect(approvalRequest('Đã đổi giá').data).toMatchObject({ note: 'Đã đổi giá' });
  });
});

describe('the emails of the plan (ADR-035, T3)', () => {
  it('are each sent once: per trial, refused charge, period, turn to read-only and invoice', () => {
    expect(trialEnding(true).idempotencyKey).toBe(`billing-trial-ending:${ID}:${AT.getTime()}`);
    expect(trialEnding(false).idempotencyKey).toBe(trialEnding(true).idempotencyKey);
    expect(chargeFailed(null, null).idempotencyKey).toBe(`billing-charge-failed:${OTHER_ID}:2`);
    expect(expiringSoon.idempotencyKey).toBe(`billing-expiring-soon:${ID}:${AT.getTime()}`);
    expect(readOnly.idempotencyKey).toBe(`billing-read-only:${ID}:${AT.getTime()}`);
    expect(receipt('Chuyển khoản').idempotencyKey).toBe(`billing-receipt:${OTHER_ID}`);
  });

  it('never carry more of a card than its network and last four digits', () => {
    expect(
      templateDataProblems('billing-charge-failed', {
        ...chargeFailed('Visa •••• 9995', null).data,
        cardNumber: '4000000000009995',
      }),
    ).toEqual(['/ must NOT have additional properties']);
    expect(
      templateDataProblems('billing-receipt', {
        ...receipt('Chuyển khoản').data,
        invoiceNumber: 'HD-1',
      }),
    ).toEqual(['/invoiceNumber must match pattern "^HD-\\d{4}-\\d{6}$"']);
  });
});

describe('the emails of the marketplace (ADR-036, MP3)', () => {
  it('are each sent once: per paid invoice, and per member and item', () => {
    expect(marketplaceReceipt('Chuyển khoản').idempotencyKey).toBe(
      `marketplace-receipt:${OTHER_ID}`,
    );
    expect(marketplaceSuggestion.idempotencyKey).toBe(
      `marketplace-suggestion:${ID}:${OTHER_ID}:mp-mo-ban-du-an-can-ho`,
    );
    const otherItem = marketplaceSuggestionEmail({
      ...SUGGESTION,
      itemId: 'mp-spa-uu-dai-ngay-le',
      workspaceName: BILLING.workspaceName,
      memberName: 'Lan Hương',
      itemName: 'Spa ưu đãi ngày lễ',
      price: '299.000 ₫',
      itemUrl: `http://localhost:3100/workspaces/${ID}/marketplace/mp-spa-uu-dai-ngay-le`,
    });
    expect(otherItem.idempotencyKey).not.toBe(marketplaceSuggestion.idempotencyKey);
  });

  it('keep the key of the longest item id within what plp-mailer takes', () => {
    const key = marketplaceSuggestionEmail({
      ...SUGGESTION,
      itemId: `mp-${'a'.repeat(47)}`,
      workspaceName: 'Mây Xanh',
      memberName: 'Lan Hương',
      itemName: 'Mẫu',
      price: '1 ₫',
      itemUrl: 'http://localhost:3100/',
    }).idempotencyKey;
    expect(key).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
  });

  it('refuse data plp-mailer could not render', () => {
    expect(
      templateDataProblems('marketplace-receipt', {
        ...marketplaceReceipt('Chuyển khoản').data,
        version: 0,
        invoiceNumber: 'HD-1',
      }).sort(),
    ).toEqual(['/invoiceNumber must match pattern "^HD-\\d{4}-\\d{6}$"', '/version must be >= 1']);
    expect(
      templateDataProblems('marketplace-suggestion', {
        ...marketplaceSuggestion.data,
        itemUrl: 'javascript:alert(1)',
        email: 'lan@example.com',
      }).sort(),
    ).toEqual(['/ must NOT have additional properties', '/itemUrl must match format "http-url"']);
  });
});
