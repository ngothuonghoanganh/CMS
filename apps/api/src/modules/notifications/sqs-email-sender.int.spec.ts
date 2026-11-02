import { Logger } from '@nestjs/common';
import {
  approvalResponseSchema,
  createInvitationsResponseSchema,
  type Domain,
  domainSchema,
  type LeadDetail,
  leadDetailSchema,
  leadListResponseSchema,
  leadRecipientSchema,
  type MeResponse,
  myAccessRequestResponseSchema,
  type PageApproval,
  problemSchema,
  type Site,
} from '@plp/contracts';
import { Types } from 'mongoose';
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
import { signedUpClient, TestClient } from '../../../test/client.js';
import { publishableDraft } from '../../../test/compositions.js';
import { pointHere } from '../../../test/domains.js';
import { createLiveFormPage, leadBody, submitLead } from '../../../test/leads.js';
import { MAIL_TEMPLATES, templateDataProblems } from '../../../test/mail-templates.js';
import { newEmail } from '../../../test/members.js';
import {
  createPage,
  getPage,
  publish,
  RecordingRevalidationClient,
  replaceDraft,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../../test/pages.js';
import { configurePrivacy } from '../../../test/privacy.js';
import { confirmationLinkIn, confirmRecipient } from '../../../test/recipients.js';
import { addMember, createSite } from '../../../test/resources.js';
import { SqsStub } from '../../../test/sqs-stub.js';
import { type EmailMessage, EmailSendError } from './email-sender.js';
import { type EmailTemplate, recipientConfirmationEmail } from './emails.js';
import { type MailerRequest, mailerRequestSchema, SqsEmailSender } from './sqs-email-sender.js';

const REGION = 'ap-southeast-1';
/** Short enough for tests, long enough that a healthy local exchange never meets them. */
const TIMEOUTS = { connectionTimeout: 300, requestTimeout: 300 };
/** The secret of the link in `EMAIL`; it must never reach a log line. */
const LINK_TOKEN = 'link-secret-0123456789';

const EMAIL = recipientConfirmationEmail({
  recipientId: '6724f0c2a1b2c3d4e5f60789',
  linkExpiresAt: new Date('2026-11-08T00:00:00.000Z'),
  siteName: 'Nha khoa Smile Care',
  invitedBy: 'Ngọc Anh',
  confirmUrl: `http://localhost:3100/lead-recipients/confirm#site=6724f0c2a1b2c3d4e5f60789&token=${LINK_TOKEN}`,
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

/** `SqsEmailSender` against an SQS endpoint that answers the way AWS does (ADR-029). */
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

  it('reports a refusal as smtp_rejected, without retrying it or logging the email', async () => {
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
    const logged = JSON.stringify(warned.mock.calls);
    expect(logged).not.toContain('a@example.com');
    expect(logged).not.toContain(LINK_TOKEN);
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

interface Member {
  client: TestClient;
  me: MeResponse;
}

function tokenOf(domain: Domain): string {
  const token = domain.records
    .find((record) => record.type === 'TXT')
    ?.value.replace('payload-verify=', '');
  if (token === undefined) {
    throw new Error('The domain has no TXT record');
  }
  return token;
}

/** The whole API with `MAIL_TRANSPORT=sqs`: every email goes to the plp-mailer queue. */
describe('the API with MAIL_TRANSPORT=sqs', () => {
  let stub: SqsStub;
  let t: TestApp;
  let owner: Member;
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
    owner = signedUp;
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

  /** A site with a confirmed lead address, through the link queued for it, and a live form. */
  async function formSite(): Promise<{ site: Site; releaseId: string }> {
    const site = await createSite(owner.client, workspaceId);
    await configurePrivacy(owner.client, site.id);
    await owner.client.post(`/sites/${site.id}/lead-recipients`, { email: RECIPIENT }).expect(201);
    const link = confirmationLinkIn(
      String(queued('recipient-confirmation').at(-1)?.data['confirmUrl']),
    );
    if (link === null) {
      throw new Error('No confirmation link was queued');
    }
    await confirmRecipient(t, link).expect(200);
    const { published } = await createLiveFormPage(owner.client, site.id, uniqueSlug('form'));
    return { site, releaseId: published.release.id };
  }

  async function send(form: { site: Site; releaseId: string }, name: string): Promise<string> {
    await submitLead(t, form.site.subdomain, leadBody(form.releaseId, { name })).expect(201);
    const list = leadListResponseSchema.parse(
      (await owner.client.get(`/sites/${form.site.id}/leads`).expect(200)).body,
    );
    const lead = list.items.find((item) => item.name === name);
    if (!lead) {
      throw new Error(`No lead named ${name}`);
    }
    return lead.id;
  }

  async function settled(
    site: Site,
    leadId: string,
    status: 'sent' | 'failed',
  ): Promise<LeadDetail> {
    let lead: LeadDetail | undefined;
    await vi.waitFor(
      async () => {
        lead = leadDetailSchema.parse(
          (await owner.client.get(`/sites/${site.id}/leads/${leadId}`).expect(200)).body,
        );
        expect(lead.notification?.status).toBe(status);
      },
      { timeout: 10_000, interval: 25 },
    );
    if (lead === undefined) {
      throw new Error('unreachable');
    }
    return lead;
  }

  /** Sends the page's saved draft for approval as `member`, and returns what the page shows. */
  async function askApproval(
    member: Member,
    site: Site,
    pageId: string,
    note: string,
  ): Promise<PageApproval | null> {
    const { draft, page } = await getPage(member.client, site.id, pageId);
    const response = await member.client
      .post(`/sites/${site.id}/pages/${pageId}/approval`, {
        expectedRevision: draft.revision,
        expectedPublishedReleaseId: page.liveRelease?.id ?? null,
        approvalId: null,
        note,
      })
      .expect(200);
    return approvalResponseSchema.parse(response.body).page.approval;
  }

  async function addDomain(site: Site, hostname: string): Promise<Domain> {
    const response = await owner.client.post(`/sites/${site.id}/domains`, { hostname }).expect(201);
    return domainSchema.parse(response.body);
  }

  async function checkDomain(site: Site, domainId: string): Promise<Domain> {
    // "Kiểm tra ngay" answers with the last check within 5 seconds: let the next one run.
    await t.connection
      .collection('domains')
      .updateOne({ _id: new Types.ObjectId(domainId) }, { $set: { 'check.at': null } });
    const response = await owner.client
      .post(`/sites/${site.id}/domains/${domainId}/check`)
      .expect(200);
    return domainSchema.parse(response.body);
  }

  it('queues each of the 14 emails, once, with data its template renders', async () => {
    const ownerEmail = owner.me.user.email;

    // Account emails (ADR-026); the owner's own sign-up queued the first confirmation.
    const anyone = new TestClient(t.app);
    await anyone
      .post('/auth/signup', { name: 'Ai đó', email: ownerEmail, workspaceName: 'Workspace khác' })
      .expect(202);
    await anyone.post('/auth/password/forgot', { email: ownerEmail }).expect(202);

    // A lead, after its address confirmed (ADR-018).
    const form = await formSite();
    const leadId = await send(form, 'Nguyễn Thu Hà');
    expect((await settled(form.site, leadId, 'sent')).notification).toMatchObject({
      attempts: 1,
      lastErrorCode: null,
      recipients: 1,
      rejectedRecipients: 0,
    });

    // An invitation, a request for another role and its refusal (ADR-021).
    const invited = newEmail('sqs');
    const invitation = await owner.client
      .post(`/workspaces/${workspaceId}/invitations`, {
        emails: [invited],
        role: 'editor',
        siteIds: null,
      })
      .expect(200);
    expect(createInvitationsResponseSchema.parse(invitation.body).results).toEqual([
      { email: invited, outcome: 'sent' },
    ]);
    const viewer = await addMember(t, workspaceId, 'viewer');
    const created = myAccessRequestResponseSchema.parse(
      (
        await viewer.client
          .post(`/workspaces/${workspaceId}/access-requests`, {
            role: 'editor',
            wholeWorkspace: true,
            note: '',
          })
          .expect(201)
      ).body,
    ).request;
    await owner.client
      .post(`/workspaces/${workspaceId}/access-requests/${created?.id ?? ''}/decline`)
      .expect(204);

    // A request to publish, refused, asked again and published (ADR-023).
    const contributor = await addMember(t, workspaceId, 'contributor');
    const page = await createPage(owner.client, form.site.id, { title: 'Ưu đãi tháng 11' });
    await replaceDraft(owner.client, form.site.id, page.page.id, publishableDraft(page.page.slug));
    const refused = await askApproval(contributor, form.site, page.page.id, 'Đổi giá');
    await owner.client
      .post(`/sites/${form.site.id}/pages/${page.page.id}/approval/reject`, {
        approvalId: refused?.id,
        revision: refused?.revision,
        reason: 'Giá chưa đúng',
      })
      .expect(200);
    const approved = await askApproval(contributor, form.site, page.page.id, '');
    const published = await publish(owner.client, form.site.id, page.page.id);

    // A custom domain goes live, is lost, then moves to another site (ADR-022).
    const hostname = `go.sqs${process.pid.toString(36)}.vn`;
    const domain = await addDomain(form.site, hostname);
    pointHere(t.dns, hostname, tokenOf(domain));
    expect((await checkDomain(form.site, domain.id)).status).toBe('active');
    t.dns.set(hostname, { CNAME: ['old-host.example.vn'] });
    expect((await checkDomain(form.site, domain.id)).status).toBe('lost');
    const other = await createSite(owner.client, workspaceId);
    const claim = await addDomain(other, hostname);
    expect(claim.status).toBe('taken');
    pointHere(t.dns, hostname, tokenOf(claim));
    expect((await checkDomain(other, claim.id)).status).toBe('active');

    const requests = requestsIn(stub);
    expect(new Set(requests.map((request) => request.template))).toEqual(new Set(MAIL_TEMPLATES));
    for (const request of requests) {
      expect(templateDataProblems(request.template as EmailTemplate, request.data)).toEqual([]);
    }
    // One message per email: no key was queued twice.
    expect(new Set(requests.map((request) => request.idempotencyKey)).size).toBe(requests.length);

    expect(queued('account-exists')).toEqual([expect.objectContaining({ to: [ownerEmail] })]);
    expect(queued('password-reset')).toEqual([
      expect.objectContaining({
        to: [ownerEmail],
        data: expect.objectContaining({ validMinutes: 60 }) as unknown,
      }),
    ]);
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
      to: [viewer.me.user.email],
      idempotencyKey: `access-decision:${created?.id ?? ''}`,
      data: { accepted: false },
    });
    expect(queued('approval-request').map((request) => request.data['note'])).toEqual([
      'Đổi giá',
      null,
    ]);
    expect(queued('approval-rejected')).toEqual([
      expect.objectContaining({
        to: [contributor.me.user.email],
        idempotencyKey: `approval-rejected:${refused?.id ?? ''}`,
      }),
    ]);
    expect(queued('approval-published')).toEqual([
      expect.objectContaining({
        to: [contributor.me.user.email],
        idempotencyKey: `approval-published:${approved?.id ?? ''}`,
        data: expect.objectContaining({
          approved: true,
          version: published.release.version,
          liveUrl: published.liveUrl,
        }) as unknown,
      }),
    ]);
    expect(queued('domain-lost')).toEqual([
      expect.objectContaining({
        to: [ownerEmail],
        data: expect.objectContaining({ hostname }) as unknown,
      }),
    ]);
    expect(queued('domain-moved')).toEqual([
      expect.objectContaining({
        to: [ownerEmail],
        idempotencyKey: `domain-moved:${domain.id}`,
        data: expect.objectContaining({ siteName: form.site.name }) as unknown,
      }),
    ]);
    expect(queued('domain-active').map((request) => request.idempotencyKey)).toEqual([
      `domain-active:${domain.id}`,
      `domain-active:${claim.id}`,
    ]);
  });

  it('fails a lead the queue refuses, and "Gửi lại" queues it under the same key', async () => {
    const form = await formSite();
    stub.mode = { status: 403, type: 'AccessDenied' };
    const leadId = await send(form, 'Hàng đợi từ chối');
    expect((await settled(form.site, leadId, 'failed')).notification).toMatchObject({
      attempts: 3,
      lastErrorCode: 'smtp_rejected',
      sentAt: null,
    });

    stub.mode = 'accept';
    await owner.client
      .post(`/sites/${form.site.id}/leads/${leadId}/notification/retry`)
      .expect(200);
    await settled(form.site, leadId, 'sent');
    expect(
      queued('lead-notification').filter(
        (request) => request.idempotencyKey === `lead-notification:${leadId}`,
      ),
    ).toHaveLength(1);
  });

  it('keeps links out of the log when the queue refuses an email that carries one', async () => {
    const site = await createSite(owner.client, workspaceId);
    const member = await addMember(t, workspaceId, 'viewer');
    const warned = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      stub.mode = { status: 403, type: 'AccessDenied' };
      const added = await owner.client
        .post(`/sites/${site.id}/lead-recipients`, { email: 'le-tan@smilecare.vn' })
        .expect(201);
      expect(leadRecipientSchema.parse(added.body)).toMatchObject({ status: 'unsent' });
      const reset = await new TestClient(t.app)
        .post('/auth/password/forgot', { email: member.me.user.email })
        .expect(503);
      expect(problemSchema.parse(reset.body).code).toBe('email_unavailable');

      const logged = JSON.stringify(warned.mock.calls);
      expect(logged).toContain('Email not queued for plp-mailer');
      expect(logged).not.toMatch(/token=|#site=|reset-password|le-tan@smilecare\.vn/);
    } finally {
      warned.mockRestore();
    }
  });
});
