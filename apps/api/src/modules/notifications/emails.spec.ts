import { describe, expect, it } from 'vitest';
import { templateDataProblems } from '../../../test/mail-templates.js';
import {
  accessDecisionEmail,
  accessRequestEmail,
  type KeyedEmail,
  type LeadEmailInput,
  leadNotificationEmail,
  memberInvitationEmail,
  recipientConfirmationEmail,
} from './emails.js';
import { mailerRequestOf } from './sqs-email-sender.js';

const ID = '6724f0c2a1b2c3d4e5f60789';
const OTHER_ID = '6724f0c2a1b2c3d4e5f6078a';
const LINK_EXPIRES_AT = new Date('2026-11-08T09:42:07.123Z');

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

function confirmation(linkExpiresAt = LINK_EXPIRES_AT): KeyedEmail {
  return recipientConfirmationEmail({
    recipientId: ID,
    linkExpiresAt,
    siteName: 'Nha khoa Smile Care',
    invitedBy: 'Ngọc Anh',
    confirmUrl: 'http://localhost:3100/lead-recipients/confirm#token=abc',
    validDays: 7,
  });
}

function invitation(linkExpiresAt = LINK_EXPIRES_AT): KeyedEmail {
  return memberInvitationEmail({
    invitationId: ID,
    linkExpiresAt,
    workspaceName: 'Mây Xanh Agency',
    invitedBy: 'Ngọc Anh',
    roleLabel: 'Biên tập viên',
    scope: 'site Nha khoa Smile Care',
    acceptUrl: 'http://localhost:3100/invite#token=abc',
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
];

/** The data of each email against the template's schema.json in plp-mailer (ADR-023). */
describe('the data of every email', () => {
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
  it('give each confirmation link its own key, without the token', () => {
    const renewed = new Date(LINK_EXPIRES_AT.getTime() + 60_000);
    expect(confirmation().idempotencyKey).toBe(
      `recipient-confirmation:${ID}:${LINK_EXPIRES_AT.getTime()}`,
    );
    expect(confirmation(renewed).idempotencyKey).not.toBe(confirmation().idempotencyKey);
    expect(confirmation().idempotencyKey).not.toContain('abc');
  });

  it('give each invitation link its own key, without the token', () => {
    const renewed = new Date(LINK_EXPIRES_AT.getTime() + 60_000);
    expect(invitation().idempotencyKey).toBe(
      `member-invitation:${ID}:${LINK_EXPIRES_AT.getTime()}`,
    );
    expect(invitation(renewed).idempotencyKey).not.toBe(invitation().idempotencyKey);
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
