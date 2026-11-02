import { describe, expect, it } from 'vitest';
import { MAIL_TEMPLATES, templateDataProblems } from '../../../test/mail-templates.js';
import {
  accessDecisionEmail,
  accessRequestEmail,
  accountExistsEmail,
  approvalPublishedEmail,
  approvalRejectedEmail,
  approvalRequestEmail,
  domainActiveEmail,
  domainLostEmail,
  domainMovedEmail,
  type KeyedEmail,
  type LeadEmailInput,
  leadNotificationEmail,
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

/** Every email the API can send, in each shape its data can take. */
const EVERY_EMAIL: Array<[string, KeyedEmail]> = [
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
