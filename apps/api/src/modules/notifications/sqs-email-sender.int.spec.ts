import { Logger } from '@nestjs/common';
import {
  createInvitationsResponseSchema,
  type LeadDetail,
  leadDetailSchema,
  leadListResponseSchema,
  myAccessRequestResponseSchema,
  type Site,
} from '@plp/contracts';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import { createLiveFormPage, leadBody, submitLead } from '../../../test/leads.js';
import { templateDataProblems } from '../../../test/mail-templates.js';
import { newEmail } from '../../../test/members.js';
import {
  RecordingRevalidationClient,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../../test/pages.js';
import { configurePrivacy } from '../../../test/privacy.js';
import { confirmRecipient } from '../../../test/recipients.js';
import { addMember, createSite } from '../../../test/resources.js';
import { SqsStub } from '../../../test/sqs-stub.js';
import { type EmailMessage, EmailSendError } from './email-sender.js';
import { type EmailTemplate, recipientConfirmationEmail } from './emails.js';
import { type MailerRequest, mailerRequestSchema, SqsEmailSender } from './sqs-email-sender.js';

const REGION = 'ap-southeast-1';
/** Short enough for tests, long enough that a healthy local exchange never meets them. */
const TIMEOUTS = { connectionTimeout: 300, requestTimeout: 300 };

const EMAIL = recipientConfirmationEmail({
  recipientId: '6724f0c2a1b2c3d4e5f60789',
  linkExpiresAt: new Date('2026-11-08T00:00:00.000Z'),
  siteName: 'Nha khoa Smile Care',
  invitedBy: 'Ngọc Anh',
  confirmUrl: 'http://localhost:3100/lead-recipients/confirm#token=abc',
  validDays: 7,
});

function message(...to: string[]): EmailMessage {
  return { to, ...EMAIL };
}

function failureOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

/** The requests the stub took, as plp-mailer reads them. */
function requestsIn(stub: SqsStub): MailerRequest[] {
  return stub.bodies().map((body) => mailerRequestSchema.parse(body));
}

// The SDK signs every request; the stub does not check the signature.
beforeAll(() => {
  vi.stubEnv('AWS_ACCESS_KEY_ID', 'test-access-key');
  vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'test-secret-key');
  vi.stubEnv('AWS_SESSION_TOKEN', undefined);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

/** `SqsEmailSender` against an SQS endpoint that answers the way AWS does (ADR-023). */
describe('SqsEmailSender', () => {
  let stub: SqsStub;
  let sender: SqsEmailSender;
  let warned: MockInstance<Logger['warn']>;

  beforeAll(async () => {
    warned = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    stub = await SqsStub.start();
    sender = new SqsEmailSender(
      { MAIL_QUEUE_URL: stub.queueUrl(), MAIL_QUEUE_REGION: REGION },
      TIMEOUTS,
    );
  });

  beforeEach(() => {
    stub.mode = 'accept';
    stub.messages.length = 0;
    stub.requests = 0;
  });

  afterAll(async () => {
    warned.mockRestore();
    sender.onModuleDestroy();
    await stub.stop();
  });

  it('queues one plp-mailer request per email, and every address counts as taken', async () => {
    const delivery = await sender.send(message('a@example.com', 'b@example.com'));
    expect(delivery).toEqual({ accepted: 2, rejected: 0, rejectionCode: null });
    expect(stub.messages.map((item) => item.queueUrl)).toEqual([stub.queueUrl()]);
    expect(requestsIn(stub)).toEqual([
      {
        template: 'recipient-confirmation',
        to: ['a@example.com', 'b@example.com'],
        data: EMAIL.data,
        idempotencyKey: EMAIL.idempotencyKey,
      },
    ]);
  });

  it('reports a refusal as smtp_rejected, without retrying it', async () => {
    stub.mode = { status: 403, type: 'AccessDenied' };
    const failure = await failureOf(sender.send(message('a@example.com')));
    expect(failure).toBeInstanceOf(EmailSendError);
    expect(failure).toMatchObject({
      code: 'smtp_rejected',
      cause: { $metadata: { httpStatusCode: 403 } },
    });
    expect(stub.requests).toBe(1);
    expect(stub.messages).toEqual([]);
    expect(warned).toHaveBeenLastCalledWith(
      {
        template: 'recipient-confirmation',
        code: 'smtp_rejected',
        awsError: 'AccessDenied',
        errorCode: null,
        requestId: expect.any(String) as string,
      },
      'Email not queued for plp-mailer',
    );
    expect(JSON.stringify(warned.mock.calls)).not.toContain('a@example.com');
  });

  it('reports a queue that keeps failing as smtp_unavailable, after the SDK retried', async () => {
    stub.mode = { status: 500, type: 'InternalError' };
    expect(await failureOf(sender.send(message('a@example.com')))).toMatchObject({
      code: 'smtp_unavailable',
    });
    expect(stub.requests).toBe(3);
  });

  it('reports a queue that never answers as timeout', async () => {
    stub.mode = 'silent';
    expect(await failureOf(sender.send(message('a@example.com')))).toMatchObject({
      code: 'timeout',
      cause: { name: 'TimeoutError' },
    });
  });

  it('reports a refused connection as smtp_unavailable', async () => {
    const gone = await SqsStub.start();
    await gone.stop();
    const unreachable = new SqsEmailSender(
      { MAIL_QUEUE_URL: gone.queueUrl(), MAIL_QUEUE_REGION: REGION },
      TIMEOUTS,
    );
    try {
      expect(await failureOf(unreachable.send(message('a@example.com')))).toMatchObject({
        code: 'smtp_unavailable',
        cause: { code: 'ECONNREFUSED' },
      });
      expect(warned).toHaveBeenLastCalledWith(
        expect.objectContaining({ code: 'smtp_unavailable', errorCode: 'ECONNREFUSED' }),
        'Email not queued for plp-mailer',
      );
    } finally {
      unreachable.onModuleDestroy();
    }
  });

  it('sends nothing plp-mailer would refuse to read, and logs the fields, not their values', async () => {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      const failure = await failureOf(
        sender.send({ ...message('not-an-address'), idempotencyKey: 'short' }),
      );
      expect(failure).toMatchObject({ code: 'unknown' });
      expect(stub.requests).toBe(0);
      expect(logged).toHaveBeenCalledWith(
        {
          template: 'recipient-confirmation',
          issues: ['to.0: invalid_format', 'idempotencyKey: invalid_format'],
        },
        'Email does not match the plp-mailer request',
      );
      expect(JSON.stringify(logged.mock.calls)).not.toContain('not-an-address');
    } finally {
      logged.mockRestore();
    }
  });
});

/** The whole API with `MAIL_TRANSPORT=sqs`: every email goes to the plp-mailer queue. */
describe('the API with MAIL_TRANSPORT=sqs', () => {
  let stub: SqsStub;
  let t: TestApp;
  let owner: TestClient;
  let ownerEmail: string;
  let workspaceId: string;
  const RECIPIENT = 'sales@smilecare.vn';

  beforeAll(async () => {
    stub = await SqsStub.start();
    t = await createTestApp('plp_test_sqs_transport', {
      ...withRevalidationRecorder(new RecordingRevalidationClient()),
      realEmail: true,
      env: { MAIL_TRANSPORT: 'sqs', MAIL_QUEUE_URL: stub.queueUrl(), MAIL_QUEUE_REGION: REGION },
      // 1 and 5 minutes in production; the schedule itself is checked in
      // notification-schedule.int.spec.ts.
      notificationRetryDelaysMs: [100, 300],
    });
    const signedUp = await signedUpClient(t.app);
    owner = signedUp.client;
    ownerEmail = signedUp.me.user.email;
    workspaceId = signedUp.workspaceId;
  });

  beforeEach(() => {
    stub.mode = 'accept';
  });

  afterAll(async () => {
    await t.close();
    await stub.stop();
  });

  /** The requests queued for `template`, oldest first. */
  function queued(template: EmailTemplate): MailerRequest[] {
    return requestsIn(stub).filter((request) => request.template === template);
  }

  async function formSite(): Promise<{ site: Site; releaseId: string }> {
    const site = await createSite(owner, workspaceId);
    await configurePrivacy(owner, site.id);
    await owner.post(`/sites/${site.id}/lead-recipients`, { email: RECIPIENT }).expect(201);
    const confirmation = queued('recipient-confirmation').at(-1);
    const confirmUrl = String(confirmation?.data['confirmUrl']);
    const token = /#token=([A-Za-z0-9_-]{43})$/.exec(confirmUrl)?.[1] ?? '';
    await confirmRecipient(t, token).expect(200);
    const { published } = await createLiveFormPage(owner, site.id, uniqueSlug('form'));
    return { site, releaseId: published.release.id };
  }

  async function send(form: { site: Site; releaseId: string }, name: string): Promise<string> {
    await submitLead(t, form.site.subdomain, leadBody(form.releaseId, { name })).expect(201);
    const list = leadListResponseSchema.parse(
      (await owner.get(`/sites/${form.site.id}/leads`).expect(200)).body,
    );
    const lead = list.items.find((item) => item.name === name);
    if (!lead) {
      throw new Error(`No lead named ${name}`);
    }
    return lead.id;
  }

  async function settled(leadId: string, status: 'sent' | 'failed'): Promise<LeadDetail> {
    let lead: LeadDetail | undefined;
    await vi.waitFor(
      async () => {
        lead = leadDetailSchema.parse((await owner.get(`/leads/${leadId}`).expect(200)).body);
        expect(lead.notification?.status).toBe(status);
      },
      { timeout: 10_000, interval: 25 },
    );
    if (lead === undefined) {
      throw new Error('unreachable');
    }
    return lead;
  }

  it('queues each of the five emails once, with data its template renders', async () => {
    const form = await formSite();
    const leadId = await send(form, 'Nguyễn Thu Hà');
    expect((await settled(leadId, 'sent')).notification).toMatchObject({
      attempts: 1,
      lastErrorCode: null,
      recipients: 1,
      rejectedRecipients: 0,
    });

    const invited = newEmail('sqs');
    const invitation = await owner
      .post(`/workspaces/${workspaceId}/invitations`, {
        emails: [invited],
        role: 'editor',
        siteIds: null,
      })
      .expect(200);
    expect(createInvitationsResponseSchema.parse(invitation.body).results).toEqual([
      { email: invited, outcome: 'sent' },
    ]);

    const member = await addMember(t, workspaceId, 'viewer');
    const created = myAccessRequestResponseSchema.parse(
      (
        await member.client
          .post(`/workspaces/${workspaceId}/access-requests`, {
            role: 'editor',
            wholeWorkspace: true,
            note: '',
          })
          .expect(201)
      ).body,
    ).request;
    await owner
      .post(`/workspaces/${workspaceId}/access-requests/${created?.id ?? ''}/decline`)
      .expect(204);

    const requests = requestsIn(stub);
    expect(requests.map((request) => request.template).sort()).toEqual([
      'access-decision',
      'access-request',
      'lead-notification',
      'member-invitation',
      'recipient-confirmation',
    ]);
    for (const request of requests) {
      expect(templateDataProblems(request.template as EmailTemplate, request.data)).toEqual([]);
    }
    expect(queued('lead-notification')).toEqual([
      expect.objectContaining({ to: [RECIPIENT], idempotencyKey: `lead-notification:${leadId}` }),
    ]);
    expect(queued('lead-notification')[0]?.data).toMatchObject({
      lead: { name: 'Nguyễn Thu Hà', phone: '0901 234 567', email: null, message: null },
    });
    expect(queued('member-invitation')[0]?.to).toEqual([invited]);
    expect(queued('access-request')[0]).toMatchObject({
      to: [ownerEmail],
      idempotencyKey: `access-request:${created?.id ?? ''}`,
      data: { note: null },
    });
    expect(queued('access-decision')[0]).toMatchObject({
      to: [member.me.user.email],
      idempotencyKey: `access-decision:${created?.id ?? ''}`,
      data: { accepted: false },
    });
  });

  it('fails a lead the queue refuses, and "Gửi lại" queues it under the same key', async () => {
    const form = await formSite();
    stub.mode = { status: 403, type: 'AccessDenied' };
    const leadId = await send(form, 'Hàng đợi từ chối');
    expect((await settled(leadId, 'failed')).notification).toMatchObject({
      attempts: 3,
      lastErrorCode: 'smtp_rejected',
      sentAt: null,
    });

    stub.mode = 'accept';
    await owner.post(`/leads/${leadId}/notification/retry`).expect(200);
    await settled(leadId, 'sent');
    expect(
      queued('lead-notification').filter(
        (request) => request.idempotencyKey === `lead-notification:${leadId}`,
      ),
    ).toHaveLength(1);
  });
});
