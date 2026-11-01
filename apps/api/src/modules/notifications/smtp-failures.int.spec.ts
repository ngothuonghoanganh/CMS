import {
  type LeadDetail,
  leadDetailSchema,
  leadListResponseSchema,
  type LeadRecipient,
  leadRecipientListResponseSchema,
  leadRecipientSchema,
  problemSchema,
  type Site,
} from '@plp/contracts';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import { testEnvInput } from '../../../test/env.js';
import { createLiveFormPage, leadBody, submitLead } from '../../../test/leads.js';
import {
  RecordingRevalidationClient,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../../test/pages.js';
import { configurePrivacy } from '../../../test/privacy.js';
import { confirmRecipient } from '../../../test/recipients.js';
import { addMember, createSite } from '../../../test/resources.js';
import {
  plainTextOf,
  SmtpStub,
  type StubMessage,
  stubConfirmationLink,
} from '../../../test/smtp-stub.js';
import { parseEnv } from '../../config/env.js';
import { EmailSendError } from './email-sender.js';
import { SmtpEmailSender } from './smtp-email-sender.js';

/** Short enough for tests, long enough that a healthy local exchange never meets them. */
const TIMEOUTS = { connectionTimeout: 500, greetingTimeout: 500, socketTimeout: 500 };
const MESSAGE = { subject: 'Kiểm tra', text: 'Xin chào', html: '<p>Xin chào</p>' };

function failureOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

/** `SmtpEmailSender` against a server that fails the way real ones do (ADR-018). */
describe('SmtpEmailSender against a failing server', () => {
  let stub: SmtpStub;
  let sender: SmtpEmailSender;

  beforeAll(async () => {
    stub = await SmtpStub.start();
    sender = new SmtpEmailSender(
      parseEnv(
        testEnvInput({
          MONGODB_URI: 'mongodb://localhost:27117/unused',
          SMTP_URL: stub.url(TIMEOUTS),
        }),
      ),
    );
  });

  afterEach(async () => {
    stub.mode = 'accept';
    await stub.stop();
    await stub.restart();
  });

  afterAll(async () => {
    sender.onModuleDestroy();
    await stub.stop();
  });

  it('reports a refused connection as smtp_unavailable', async () => {
    await stub.stop();
    const failure = await failureOf(sender.send({ to: ['a@example.com'], ...MESSAGE }));
    expect(failure).toBeInstanceOf(EmailSendError);
    expect(failure).toMatchObject({
      code: 'smtp_unavailable',
      cause: { code: 'ESOCKET', originalCode: 'ECONNREFUSED' },
    });
  });

  it('reports a server that never greets, or stops answering, as timeout', async () => {
    stub.mode = 'silent';
    expect(await failureOf(sender.send({ to: ['a@example.com'], ...MESSAGE }))).toMatchObject({
      code: 'timeout',
      cause: { code: 'ETIMEDOUT' },
    });
    stub.mode = 'stall';
    expect(await failureOf(sender.send({ to: ['a@example.com'], ...MESSAGE }))).toMatchObject({
      code: 'timeout',
      cause: { code: 'ETIMEDOUT' },
    });
    expect(stub.messages).toEqual([]);
  });

  it('delivers to the addresses the server takes and reports a 550 for the others', async () => {
    stub.refuse('da-nghi@example.com');
    const delivery = await sender.send({
      to: ['nhan@example.com', 'da-nghi@example.com'],
      ...MESSAGE,
    });
    expect(delivery).toEqual({ accepted: 1, rejected: 1, rejectionCode: 'smtp_rejected' });
    expect(stub.messages.map((message) => message.to)).toEqual([['nhan@example.com']]);

    const failure = await failureOf(sender.send({ to: ['da-nghi@example.com'], ...MESSAGE }));
    expect(failure).toMatchObject({
      code: 'smtp_rejected',
      cause: { code: 'EENVELOPE', responseCode: 550 },
    });
  });
});

/** Lead emails and confirmation links through the whole API, over a failing SMTP server. */
describe('lead emails over a failing SMTP server', () => {
  let stub: SmtpStub;
  let t: TestApp;
  let owner: TestClient;
  let support: TestClient;
  let workspaceId: string;
  const RECIPIENT = 'sales@smilecare.vn';

  beforeAll(async () => {
    stub = await SmtpStub.start();
    t = await createTestApp('plp_test_smtp_failures', {
      ...withRevalidationRecorder(new RecordingRevalidationClient()),
      realEmail: true,
      env: {
        SMTP_URL: stub.url(TIMEOUTS),
        LEAD_LIMIT_PER_CLIENT: 1000,
        LEAD_LIMIT_PER_SITE_PER_HOUR: 1000,
      },
      // 1 and 5 minutes in production; the schedule itself is checked in
      // notification-schedule.int.spec.ts.
      notificationRetryDelaysMs: [100, 300],
    });
    const signedUp = await signedUpClient(t.app);
    owner = signedUp.client;
    workspaceId = signedUp.workspaceId;
    support = (await addMember(t, workspaceId, 'support')).client;
  });

  afterEach(async () => {
    stub.mode = 'accept';
    await stub.stop();
    await stub.restart();
  });

  afterAll(async () => {
    await t.close();
    await stub.stop();
  });

  async function addRecipient(site: Site, email: string): Promise<LeadRecipient> {
    const response = await owner.post(`/sites/${site.id}/lead-recipients`, { email }).expect(201);
    return leadRecipientSchema.parse(response.body);
  }

  async function recipients(site: Site): Promise<LeadRecipient[]> {
    const response = await owner.get(`/sites/${site.id}/lead-recipients`).expect(200);
    return leadRecipientListResponseSchema.parse(response.body).items;
  }

  /** Adds and confirms the address through the link the stub received. */
  async function addConfirmed(site: Site, email: string): Promise<void> {
    await addRecipient(site, email);
    await confirmRecipient(t, stubConfirmationLink(stub, email)).expect(200);
  }

  async function formSite(): Promise<{ site: Site; releaseId: string }> {
    const site = await createSite(owner, workspaceId);
    await configurePrivacy(owner, site.id);
    await addConfirmed(site, RECIPIENT);
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

  async function settled(
    { site }: { site: Site },
    leadId: string,
    status: 'sent' | 'failed',
  ): Promise<LeadDetail> {
    let lead: LeadDetail | undefined;
    await vi.waitFor(
      async () => {
        lead = leadDetailSchema.parse(
          (await owner.get(`/sites/${site.id}/leads/${leadId}`).expect(200)).body,
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

  /** The lead emails the stub took for `name`; confirmation links are left out. */
  function leadEmails(name: string): StubMessage[] {
    return stub.messages.filter((message) => plainTextOf(message).includes(`Họ và tên: ${name}`));
  }

  it('fails after three refused connections, again on "Gửi lại" while down, then sends', async () => {
    const form = await formSite();
    await stub.stop();
    const leadId = await send(form, 'Mất kết nối');
    expect((await settled(form, leadId, 'failed')).notification).toEqual({
      status: 'failed',
      attempts: 3,
      lastErrorCode: 'smtp_unavailable',
      sentAt: null,
      recipients: null,
      rejectedRecipients: null,
    });
    const list = leadListResponseSchema.parse(
      (await owner.get(`/sites/${form.site.id}/leads`).expect(200)).body,
    );
    expect(list.items.find((item) => item.id === leadId)?.notificationFailed).toBe(true);

    // "Gửi lại" while the server is still down starts three attempts over, which fail the same way.
    const retried = await support
      .post(`/sites/${form.site.id}/leads/${leadId}/notification/retry`)
      .expect(200);
    expect(leadDetailSchema.parse(retried.body).notification).toMatchObject({
      status: 'pending',
      attempts: 0,
      lastErrorCode: null,
    });
    expect((await settled(form, leadId, 'failed')).notification).toMatchObject({
      attempts: 3,
      lastErrorCode: 'smtp_unavailable',
    });

    await stub.restart();
    await owner.post(`/sites/${form.site.id}/leads/${leadId}/notification/retry`).expect(200);
    expect((await settled(form, leadId, 'sent')).notification).toMatchObject({
      attempts: 1,
      lastErrorCode: null,
      recipients: 1,
      rejectedRecipients: 0,
    });
    expect(leadEmails('Mất kết nối').map((message) => message.to)).toEqual([[RECIPIENT]]);
  });

  it('records a server that stops answering as timeout, after three attempts', async () => {
    const form = await formSite();
    stub.mode = 'stall';
    const leadId = await send(form, 'Máy chủ treo');
    expect((await settled(form, leadId, 'failed')).notification).toMatchObject({
      attempts: 3,
      lastErrorCode: 'timeout',
      sentAt: null,
    });
  });

  it('sends once to the address the server takes when it refuses the other with a 550', async () => {
    const form = await formSite();
    await addConfirmed(form.site, 'da-nghi@smilecare.vn');
    stub.refuse('da-nghi@smilecare.vn');
    const leadId = await send(form, 'Một địa chỉ bị từ chối');
    expect((await settled(form, leadId, 'sent')).notification).toMatchObject({
      status: 'sent',
      attempts: 1,
      recipients: 1,
      rejectedRecipients: 1,
      lastErrorCode: 'smtp_rejected',
    });
    // No retry: it would repeat the email to the address that took it. Well past both waits:
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(leadEmails('Một địa chỉ bị từ chối').map((message) => message.to)).toEqual([
      [RECIPIENT],
    ]);
  });

  it('keeps an address unsent while its link cannot be sent, counting no email, then sends it', async () => {
    const site = await createSite(owner, workspaceId);
    await stub.stop();
    const added = await addRecipient(site, 'le-tan@smilecare.vn');
    expect(added).toMatchObject({ status: 'unsent', invitedAt: null, confirmedAt: null });
    // "Gửi lại" while the server is still down: still unsent. No email went out, so none counts
    // against the 5 a day this site may send this address.
    for (let index = 0; index < 6; index += 1) {
      const resent = await owner
        .post(`/sites/${site.id}/lead-recipients/${added.id}/resend`)
        .expect(200);
      expect(leadRecipientSchema.parse(resent.body)).toMatchObject({
        status: 'unsent',
        invitedAt: null,
      });
    }
    expect(await recipients(site)).toMatchObject([{ status: 'unsent', invitedAt: null }]);

    await stub.restart();
    for (let index = 0; index < 5; index += 1) {
      const resent = await owner
        .post(`/sites/${site.id}/lead-recipients/${added.id}/resend`)
        .expect(200);
      expect(leadRecipientSchema.parse(resent.body)).toMatchObject({ status: 'pending' });
    }
    const capped = await owner
      .post(`/sites/${site.id}/lead-recipients/${added.id}/resend`)
      .expect(429);
    expect(problemSchema.parse(capped.body).code).toBe('rate_limited');
    expect(stub.to('le-tan@smilecare.vn')).toHaveLength(5);

    await confirmRecipient(t, stubConfirmationLink(stub, 'le-tan@smilecare.vn')).expect(200);
    expect(await recipients(site)).toMatchObject([{ status: 'confirmed' }]);
  });
});
