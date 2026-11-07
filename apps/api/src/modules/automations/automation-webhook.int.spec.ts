import { createHmac } from 'node:crypto';
import {
  type AutomationDetail,
  automationDetailSchema,
  automationListItemSchema,
  automationRunDetailSchema,
  automationRunListResponseSchema,
  type PublicLeadRequest,
  retryRunsResponseSchema,
  revealedSecretSchema,
  type Site,
} from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import { formDraft, leadFormSection } from '../../../test/compositions.js';
import { createLiveFormPage, leadBody, submitLead } from '../../../test/leads.js';
import {
  RecordingRevalidationClient,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../../test/pages.js';
import { configurePrivacy } from '../../../test/privacy.js';
import { addConfirmedRecipient } from '../../../test/recipients.js';
import { addMember, createSite } from '../../../test/resources.js';
import type { AutomationRecord, AutomationRunRecord } from './automation.schema.js';
import { AutomationScheduler } from './automation-scheduler.service.js';
import { type WebhookCall, WebhookError, WebhookSender } from './webhook-sender.js';

/** Answers webhooks as the test says, and keeps what was sent; nothing leaves the test. */
class FakeWebhookSender {
  readonly calls: WebhookCall[] = [];
  private readonly answers: Array<number | WebhookError> = [];

  answerNext(...answers: Array<number | WebhookError>): void {
    this.answers.push(...answers);
  }

  send(call: WebhookCall): Promise<number> {
    this.calls.push(call);
    const answer = this.answers.shift() ?? 200;
    if (answer instanceof WebhookError) {
      return Promise.reject(answer);
    }
    return Promise.resolve(answer);
  }
}

const HOOK = 'https://hooks.example.com/plp';

/** The webhook step, run history, retries and skips (ADR-034, board 27). */
describe('automation webhooks and run history', () => {
  let t: TestApp;
  let owner: TestClient;
  let workspaceId: string;
  const webhooks = new FakeWebhookSender();

  beforeAll(async () => {
    const revalidation = withRevalidationRecorder(new RecordingRevalidationClient()).override;
    t = await createTestApp('plp_test_automation_webhook', {
      env: { LEAD_LIMIT_PER_CLIENT: 1000, LEAD_LIMIT_PER_SITE_PER_HOUR: 1000 },
      override: (builder) =>
        (revalidation === undefined ? builder : revalidation(builder))
          .overrideProvider(WebhookSender)
          .useValue(webhooks),
    });
    const signedUp = await signedUpClient(t.app);
    owner = signedUp.client;
    workspaceId = signedUp.workspaceId;
  });

  afterAll(async () => {
    await t.close();
  });

  interface FormSite {
    site: Site;
    releaseId: string;
  }

  async function formSite(): Promise<FormSite> {
    const site = await createSite(owner, workspaceId);
    await configurePrivacy(owner, site.id);
    await addConfirmedRecipient(t, owner, site.id);
    const slug = uniqueSlug('uu-dai');
    const { published } = await createLiveFormPage(
      owner,
      site.id,
      slug,
      formDraft(slug, leadFormSection()),
    );
    return { site, releaseId: published.release.id };
  }

  async function send(form: FormSite, overrides: Partial<PublicLeadRequest> = {}): Promise<void> {
    await submitLead(t, form.site.subdomain, leadBody(form.releaseId, overrides)).expect(201);
  }

  /** A "send_webhook" automation pointed at `HOOK`, its secret as it was shown once. */
  async function webhookAutomation(
    site: Site,
  ): Promise<{ detail: AutomationDetail; base: string }> {
    const created = automationListItemSchema.parse(
      (await owner.post(`/sites/${site.id}/automations`, { recipe: 'send_webhook' }).expect(201))
        .body,
    );
    const base = `/sites/${site.id}/automations/${created.id}`;
    const draft = automationDetailSchema.parse((await owner.get(base).expect(200)).body);
    expect(draft.missing).toBe(1);
    const detail = automationDetailSchema.parse(
      (
        await owner
          .patch(base, {
            definition: {
              ...draft.definition,
              actions: [{ kind: 'webhook', url: HOOK, secretId: '' }],
            },
          })
          .expect(200)
      ).body,
    );
    return { detail, base };
  }

  function db<T extends object>(name: string) {
    return t.workspaceDb(workspaceId).collection<T>(name);
  }

  async function settle(automationId: string): Promise<AutomationRunRecord[]> {
    const scheduler = t.app.get(AutomationScheduler);
    for (let round = 0; round < 50; round += 1) {
      await scheduler.wake();
      const runs = await db<AutomationRunRecord>('automation_runs')
        .find({ automationId: new Types.ObjectId(automationId) })
        .toArray();
      if (runs.length > 0 && runs.every((run) => run.nextAt === undefined)) {
        return runs;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('The runs did not finish');
  }

  async function dueNow(automationId: string): Promise<void> {
    const past = new Date(Date.now() - 1000);
    await db<AutomationRunRecord>('automation_runs').updateMany(
      { automationId: new Types.ObjectId(automationId), nextAt: { $exists: true } },
      { $set: { nextAt: past } },
    );
    await t.connection
      .collection('job_wakeups')
      .updateOne(
        { workspaceId: new Types.ObjectId(workspaceId) },
        { $min: { dueAt: past }, $inc: { seq: 1 } },
      );
  }

  it('gives a webhook step its secret once, keeps it encrypted, and rotates it', async () => {
    const form = await formSite();
    const { detail, base } = await webhookAutomation(form.site);
    const action = detail.definition.actions[0];
    expect(action).toMatchObject({ kind: 'webhook', url: HOOK });
    const secretId = action?.kind === 'webhook' ? action.secretId : '';
    expect(secretId).not.toBe('');
    expect(detail.missing).toBe(0);
    expect(detail.revealedSecrets).toEqual([
      { secretId, secret: expect.stringMatching(/^whsec_[0-9a-f]{64}$/) as unknown },
    ]);
    const secret = detail.revealedSecrets[0]?.secret ?? '';

    // Never in clear in the database, never again in a response.
    const stored = await db<AutomationRecord>('automations').findOne({
      _id: new Types.ObjectId(detail.id),
    });
    expect(JSON.stringify(stored)).not.toContain(secret.slice(6));
    expect(stored?.webhookSecrets).toHaveLength(1);
    const again = automationDetailSchema.parse((await owner.get(base).expect(200)).body);
    expect(again.revealedSecrets).toEqual([]);
    const saved = automationDetailSchema.parse(
      (await owner.patch(base, { definition: again.definition }).expect(200)).body,
    );
    expect(saved.revealedSecrets).toEqual([]);

    // A step names only a secret it was given; addresses outside HTTPS on 443 are refused.
    await owner
      .patch(base, {
        definition: {
          ...again.definition,
          actions: [{ kind: 'webhook', url: HOOK, secretId: 'someone-elses' }],
        },
      })
      .expect(422);
    for (const url of [
      'http://hooks.example.com/',
      'https://hooks.example.com:8443/',
      'https://u:p@x.vn/',
    ]) {
      await owner
        .patch(base, {
          definition: { ...again.definition, actions: [{ kind: 'webhook', url, secretId }] },
        })
        .expect(422);
    }

    const rotated = revealedSecretSchema.parse(
      (await owner.post(`${base}/webhook-secret`, { secretId }).expect(200)).body,
    );
    expect(rotated.secretId).toBe(secretId);
    expect(rotated.secret).not.toBe(secret);
    await owner.post(`${base}/webhook-secret`, { secretId: 'nope' }).expect(404);
    const support = await addMember(t, workspaceId, 'support');
    await support.client.post(`${base}/webhook-secret`, { secretId }).expect(403);
  });

  it('sends the lead signed with the step’s secret, retries a 500 and fails on a 400', async () => {
    const form = await formSite();
    const { detail, base } = await webhookAutomation(form.site);
    const secret = detail.revealedSecrets[0]?.secret ?? '';
    await owner.post(`${base}/state`, { state: 'on' }).expect(200);

    webhooks.answerNext(new WebhookError('http_error', true, 500));
    await send(form, { name: 'Phạm Mỹ Duyên', phone: '0977 645 010' });
    await t.app.get(AutomationScheduler).wake();
    const [waiting] = await db<AutomationRunRecord>('automation_runs')
      .find({ automationId: new Types.ObjectId(detail.id) })
      .toArray();
    expect(waiting).toMatchObject({
      status: 'waiting_retry',
      steps: [
        { status: 'failed', attempts: 1, error: { code: 'webhook_http_error', httpStatus: 500 } },
      ],
    });
    await dueNow(detail.id);
    const [run] = await settle(detail.id);
    expect(run).toMatchObject({
      status: 'succeeded',
      steps: [{ status: 'succeeded', attempts: 2, summary: 'gửi lead tới hooks.example.com' }],
    });

    // Both tries carry the same key; the signature is HMAC-SHA256 of "t.body".
    const calls = webhooks.calls.filter((call) => call.body.includes('Phạm Mỹ Duyên'));
    expect(calls).toHaveLength(2);
    const call = calls[1];
    expect(call?.url).toBe(HOOK);
    expect(call?.headers['idempotency-key']).toBe(`${String(run?._id)}:0`);
    expect(calls[0]?.headers['idempotency-key']).toBe(call?.headers['idempotency-key']);
    expect(call?.headers['x-plp-event']).toBe('lead_created');
    const [, timestamp, signature] =
      /^t=(\d+),v1=([0-9a-f]{64})$/.exec(call?.headers['x-plp-signature'] ?? '') ?? [];
    expect(signature).toBe(
      createHmac('sha256', secret).update(`${timestamp}.${call?.body}`).digest('hex'),
    );
    const body = JSON.parse(call?.body ?? '{}') as Record<string, unknown>;
    expect(body).toMatchObject({
      version: 1,
      event: 'lead_created',
      automation: { id: detail.id },
      site: { id: form.site.id },
      lead: { name: 'Phạm Mỹ Duyên', phone: '+84977645010', consent: { marketing: false } },
    });
    // Counted once, though tried twice.
    expect(run?.countedIn).not.toBeNull();
    const usage = await db<{ used: number }>('automation_usage').findOne({});
    expect(usage?.used).toBe(1);

    webhooks.answerNext(new WebhookError('http_error', false, 400));
    await send(form, { name: 'Lê Hoàng Nam', phone: '0938 222 104' });
    const runs = await settle(detail.id);
    expect(runs.find((item) => item.status === 'failed')).toMatchObject({
      steps: [
        { status: 'failed', attempts: 1, error: { code: 'webhook_http_error', httpStatus: 400 } },
      ],
    });
  });

  it('lists the runs, retries a failed one at its step, skips one, and keeps to the roles', async () => {
    const form = await formSite();
    const { detail, base } = await webhookAutomation(form.site);
    await owner.post(`${base}/state`, { state: 'on' }).expect(200);
    webhooks.answerNext(
      new WebhookError('blocked_address', false),
      new WebhookError('http_error', false, 404),
    );
    await send(form, { name: 'Trần Quốc Việt', phone: '0903 118 902' });
    await settle(detail.id);
    await send(form, { name: 'Đỗ Thu Trang', phone: '0912 555 018' });
    await settle(detail.id);
    await send(form, { name: 'Ngô Bảo Châu', phone: '0987 101 202' });
    await settle(detail.id);

    const list = automationRunListResponseSchema.parse(
      (await owner.get(`${base}/runs`).expect(200)).body,
    );
    expect(list.items.map((item) => [item.contactName, item.status])).toEqual([
      ['Ngô Bảo Châu', 'succeeded'],
      ['Đỗ Thu Trang', 'failed'],
      ['Trần Quốc Việt', 'failed'],
    ]);
    expect(list).toMatchObject({ failed: 2, failedLastDay: 2, nextCursor: null });
    const failed = automationRunListResponseSchema.parse(
      (await owner.get(`${base}/runs?status=failed`).expect(200)).body,
    );
    expect(failed.items).toHaveLength(2);
    await owner.get(`${base}/runs?status=nope`).expect(422);

    const [trang, viet] = failed.items;
    const shown = automationRunDetailSchema.parse(
      (await owner.get(`${base}/runs/${String(viet?.id)}`).expect(200)).body,
    );
    expect(shown.steps).toEqual([
      expect.objectContaining({
        status: 'failed',
        error: { code: 'webhook_blocked_address', httpStatus: null },
      }),
    ]);

    // A viewer reads; only a manager retries or skips.
    const support = await addMember(t, workspaceId, 'support');
    await support.client.get(`${base}/runs/${String(viet?.id)}`).expect(200);
    await support.client.post(`${base}/runs/${String(viet?.id)}/retry`).expect(403);
    await support.client.post(`${base}/runs/${String(viet?.id)}/skip`).expect(403);

    const retried = automationRunDetailSchema.parse(
      (await owner.post(`${base}/runs/${String(viet?.id)}/retry`).expect(200)).body,
    );
    expect(retried).toMatchObject({
      status: 'queued',
      steps: [{ status: 'pending', attempts: 0 }],
    });
    await owner.post(`${base}/runs/${String(viet?.id)}/retry`).expect(409);
    const runs = await settle(detail.id);
    expect(runs.find((run) => run._id.toHexString() === viet?.id)?.status).toBe('succeeded');
    expect(
      await db('activity').countDocuments({
        siteId: new Types.ObjectId(form.site.id),
        type: 'automation.retried',
      }),
    ).toBe(1);

    const skipped = automationRunDetailSchema.parse(
      (await owner.post(`${base}/runs/${String(trang?.id)}/skip`).expect(200)).body,
    );
    expect(skipped).toMatchObject({ status: 'skipped', reason: 'by_member' });
    await owner.post(`${base}/runs/${String(trang?.id)}/skip`).expect(409);
    await owner.get(`${base}/runs/${new Types.ObjectId().toHexString()}`).expect(404);
  });

  it('retries the failed runs of 30 days once the automation is on again', async () => {
    const form = await formSite();
    const { detail, base } = await webhookAutomation(form.site);
    await owner.post(`${base}/state`, { state: 'on' }).expect(200);
    webhooks.answerNext(
      new WebhookError('http_error', false, 410),
      new WebhookError('http_error', false, 410),
    );
    await send(form, { name: 'Hồ Minh Khoa', phone: '0905 300 111' });
    await send(form, { name: 'Vũ Lan Anh', phone: '0906 300 222' });
    await settle(detail.id);
    await owner.post(`${base}/state`, { state: 'paused' }).expect(200);
    await owner.post(`${base}/runs/retry-failed`).expect(409);
    await owner.post(`${base}/state`, { state: 'on' }).expect(200);
    const response = retryRunsResponseSchema.parse(
      (await owner.post(`${base}/runs/retry-failed`).expect(200)).body,
    );
    expect(response.retried).toBe(2);
    const runs = await settle(detail.id);
    expect(runs.map((run) => run.status)).toEqual(['succeeded', 'succeeded']);
    expect(
      retryRunsResponseSchema.parse(
        (await owner.post(`${base}/runs/retry-failed`).expect(200)).body,
      ).retried,
    ).toBe(0);
  });
});
