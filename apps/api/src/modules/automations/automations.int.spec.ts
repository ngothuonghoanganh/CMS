import {
  type AutomationListItem,
  automationListItemSchema,
  automationListResponseSchema,
  problemSchema,
  type PublicLeadRequest,
  type Site,
  timelineResponseSchema,
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
import { createSecondInstance } from '../../../test/instances.js';
import { addMember, createSite } from '../../../test/resources.js';
import type { ContactRecord } from '../contacts/contact.schema.js';
import type { TaskRecord } from '../contacts/profile.schema.js';
import type { LeadRecord } from '../leads/lead.schema.js';
import type { AutomationRecord, AutomationRunRecord } from './automation.schema.js';
import { AutomationScheduler } from './automation-scheduler.service.js';

/** Automations (board 25, ADR-034): recipes, the queue, the internal actions, quota and pauses. */
describe('automations', () => {
  let t: TestApp;
  let owner: TestClient;
  let ownerId: string;
  let workspaceId: string;

  beforeAll(async () => {
    t = await createTestApp('plp_test_automations', {
      ...withRevalidationRecorder(new RecordingRevalidationClient()),
      env: { LEAD_LIMIT_PER_CLIENT: 1000, LEAD_LIMIT_PER_SITE_PER_HOUR: 1000 },
    });
    const signedUp = await signedUpClient(t.app);
    owner = signedUp.client;
    ownerId = signedUp.me.user.id;
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

  async function create(site: Site, recipe: string, client = owner): Promise<AutomationListItem> {
    const response = await client.post(`/sites/${site.id}/automations`, { recipe }).expect(201);
    return automationListItemSchema.parse(response.body);
  }

  async function enable(site: Site, id: string): Promise<void> {
    await owner.post(`/sites/${site.id}/automations/${id}/state`, { state: 'on' }).expect(200);
  }

  function db<T extends object>(name: string) {
    return t.workspaceDb(workspaceId).collection<T>(name);
  }

  /** Runs the queue now, until every run of the automation is finished. */
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

  /** As if the run's time came: `lead_still_new` and retries wait minutes. */
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

  async function contactOf(site: Site): Promise<ContactRecord | null> {
    return db<ContactRecord>('contacts').findOne({ siteId: new Types.ObjectId(site.id) });
  }

  it('creates drafts from recipes, lists them with the month’s runs, and keeps them to their roles', async () => {
    const { site } = await formSite();
    const assign = await create(site, 'assign_new_leads');
    expect(assign).toMatchObject({
      name: 'Giao lead mới cho người trực',
      state: 'draft',
      trigger: { kind: 'lead_created', pageIds: [] },
      missing: 0,
      createdBy: { id: ownerId },
      lastRun: null,
    });
    const response = await owner.get(`/sites/${site.id}/automations`).expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const list = automationListResponseSchema.parse(response.body);
    expect(list.items.map((item) => item.id)).toEqual([assign.id]);
    expect(list.usage).toMatchObject({ limit: 2000 });

    const support = await addMember(t, workspaceId, 'support');
    await support.client.get(`/sites/${site.id}/automations`).expect(200);
    await support.client
      .post(`/sites/${site.id}/automations`, { recipe: 'notify_won' })
      .expect(403);
    await support.client
      .post(`/sites/${site.id}/automations/${assign.id}/state`, { state: 'on' })
      .expect(403);
    const editor = await addMember(t, workspaceId, 'editor');
    await editor.client.get(`/sites/${site.id}/automations`).expect(403);
    const stranger = await signedUpClient(t.app);
    await stranger.client.get(`/sites/${site.id}/automations`).expect(404);
    const other = await createSite(owner, workspaceId);
    await owner
      .post(`/sites/${other.id}/automations/${assign.id}/state`, { state: 'on' })
      .expect(404);
  });

  it('gives a new lead to the member on duty with a task, then tells the profile', async () => {
    const form = await formSite();
    const automation = await create(form.site, 'assign_new_leads');
    await enable(form.site, automation.id);
    await send(form, { name: 'Phạm Mỹ Duyên', phone: '0977 645 010' });

    const [run] = await settle(automation.id);
    expect(run).toMatchObject({ status: 'succeeded', countedIn: expect.any(String) as unknown });
    const contact = await contactOf(form.site);
    expect(contact?.ownerId?.toHexString()).toBe(ownerId);
    if (contact === null) {
      throw new Error('No contact');
    }
    const tasks = await db<TaskRecord>('tasks').find({ contactId: contact._id }).toArray();
    expect(tasks).toMatchObject([{ title: 'Gọi lại trong 15 phút', source: 'automation' }]);
    expect(tasks[0]?.assigneeId.toHexString()).toBe(ownerId);
    const timeline = timelineResponseSchema.parse(
      (
        await owner
          .get(`/sites/${form.site.id}/contacts/${contact._id.toHexString()}/timeline`)
          .expect(200)
      ).body,
    );
    expect(timeline.items.find((item) => item.kind === 'automation')).toMatchObject({
      name: 'Giao lead mới cho người trực',
      summary: expect.stringMatching(
        /^Giao cho .+, tạo công việc “Gọi lại trong 15 phút”\.$/,
      ) as unknown,
    });
    const list = automationListResponseSchema.parse(
      (await owner.get(`/sites/${form.site.id}/automations`).expect(200)).body,
    );
    expect(list.items[0]).toMatchObject({
      state: 'on',
      lastRun: { status: 'succeeded' },
      last30Days: { runs: 1, failed: 0 },
    });
    expect(list.usage.used).toBeGreaterThanOrEqual(1);

    // Suspected spam starts nothing, and the same event never runs twice.
    await send(form, { name: 'Bot', phone: '0938 000 111', honeypot: 'https://spam.example' });
    expect(await settle(automation.id)).toHaveLength(1);
  });

  it('reminds of a lead still new after its minutes, and skips one moved on meanwhile', async () => {
    const form = await formSite();
    const automation = await create(form.site, 'remind_uncalled');
    await enable(form.site, automation.id);
    await send(form, { name: 'Lê Hoàng Nam', phone: '0938 222 104' });
    await send(form, { name: 'Trần Quốc Việt', phone: '0903 118 902' });
    const waiting = await db<AutomationRunRecord>('automation_runs')
      .find({ automationId: new Types.ObjectId(automation.id) })
      .toArray();
    expect(waiting.map((run) => run.status)).toEqual(['scheduled', 'scheduled']);
    // Somebody called Việt meanwhile; Nam waits.
    const viet = await db<LeadRecord>('leads').findOne({ 'fields.name': 'Trần Quốc Việt' });
    await owner
      .patch(`/sites/${form.site.id}/leads/${String(viet?._id)}`, { status: 'contacted' })
      .expect(200);
    // Nam's profile has its owner for the email.
    const nam = await db<ContactRecord>('contacts').findOne({ name: 'Lê Hoàng Nam' });
    await owner
      .patch(`/sites/${form.site.id}/contacts/${String(nam?._id)}`, { action: 'assign', ownerId })
      .expect(200);
    const before = t.emails.sent.length;

    await dueNow(automation.id);
    const runs = await settle(automation.id);
    expect(runs.map((run) => [run.status, run.reason]).sort()).toEqual([
      ['skipped', 'not_new'],
      ['succeeded', null],
    ]);
    const sent = t.emails.sent
      .slice(before)
      .filter((email) => email.template === 'automation-notice');
    // To the owner, and to the managers of the recipe.
    expect(sent.length).toBeGreaterThanOrEqual(1);
    expect(sent[0]?.subject).toBe('Lê Hoàng Nam chưa được gọi sau 15 phút');
    expect(sent[0]?.text).not.toContain('0938');
    expect(sent[0]?.text).toContain(`/contacts/${String(nam?._id)}`);
  });

  it('tells the managers of a win, and tries a failed email again before it counts as failed', async () => {
    const form = await formSite();
    const automation = await create(form.site, 'notify_won');
    await enable(form.site, automation.id);
    await send(form, { name: 'Võ Ngọc Hân', phone: '0868 300 471' });
    const opportunity = await db('opportunities').findOne({
      siteId: new Types.ObjectId(form.site.id),
    });
    // The lead's own notification goes out first, in the background.
    for (let wait = 0; wait < 100; wait += 1) {
      if (
        t.emails.sent.some(
          (email) => email.template === 'lead-notification' && email.text.includes('Võ Ngọc Hân'),
        )
      ) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    t.emails.failNext('smtp_unavailable');
    await owner
      .post(`/sites/${form.site.id}/opportunities/${String(opportunity?._id)}/stage`, {
        stage: 'won',
        from: 'new',
        value: 25_000_000,
        on: '2026-11-05',
      })
      .expect(200);
    await t.app.get(AutomationScheduler).wake();
    const [waiting] = await db<AutomationRunRecord>('automation_runs')
      .find({ automationId: new Types.ObjectId(automation.id) })
      .toArray();
    expect(waiting).toMatchObject({
      status: 'waiting_retry',
      steps: [{ status: 'failed', attempts: 1, error: { code: 'email_smtp_unavailable' } }],
    });
    // 5 minutes later the step runs again and succeeds; the run counted once.
    await dueNow(automation.id);
    const [run] = await settle(automation.id);
    expect(run).toMatchObject({
      status: 'succeeded',
      steps: [{ status: 'succeeded', attempts: 2 }],
    });
    const sent = t.emails.sent.filter(
      (email) => email.template === 'automation-notice' && email.subject.startsWith('Đã chốt được'),
    );
    expect(sent.at(-1)?.subject).toMatch(/^Đã chốt được Võ Ngọc Hân từ /);
  });

  it('pauses: waiting runs stop, and an automation missing a step cannot be enabled', async () => {
    const form = await formSite();
    const automation = await create(form.site, 'remind_uncalled');
    await enable(form.site, automation.id);
    await send(form, { name: 'Đặng Minh Tú', phone: '0789 554 321' });
    await owner
      .post(`/sites/${form.site.id}/automations/${automation.id}/state`, { state: 'paused' })
      .expect(200);
    const [run] = await db<AutomationRunRecord>('automation_runs')
      .find({ automationId: new Types.ObjectId(automation.id) })
      .toArray();
    expect(run).toMatchObject({ status: 'stopped', reason: 'paused' });
    expect(run?.nextAt).toBeUndefined();

    const copy = automationListItemSchema.parse(
      (
        await owner
          .post(`/sites/${form.site.id}/automations/${automation.id}/duplicate`)
          .expect(201)
      ).body,
    );
    expect(copy).toMatchObject({ name: 'Nhắc khi lead chưa được gọi (bản sao)', state: 'draft' });
    await db<AutomationRecord>('automations').updateOne(
      { _id: new Types.ObjectId(copy.id) },
      { $set: { 'definition.actions': [] } },
    );
    const refused = await owner
      .post(`/sites/${form.site.id}/automations/${copy.id}/state`, { state: 'on' })
      .expect(422);
    expect(problemSchema.parse(refused.body).issues?.[0]).toMatchObject({
      code: 'missing_steps',
      message: 'Còn 1 bước thiếu cấu hình',
    });
  });

  it('stops at the month’s runs, counting what it passed over, without the conditions’ skips', async () => {
    const form = await formSite();
    const automation = await create(form.site, 'assign_new_leads');
    await enable(form.site, automation.id);
    const month = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 7);
    await db('automation_usage').updateOne(
      { workspaceId: new Types.ObjectId(workspaceId), month },
      { $set: { used: 2000, createdAt: new Date(), updatedAt: new Date() } },
      { upsert: true },
    );
    await send(form, { name: 'Bùi Thanh Hương', phone: '0915 007 266' });
    const [run] = await settle(automation.id);
    expect(run).toMatchObject({ status: 'skipped', reason: 'quota', countedIn: null });
    expect((await contactOf(form.site))?.ownerId ?? null).toBeNull();
    const list = automationListResponseSchema.parse(
      (await owner.get(`/sites/${form.site.id}/automations`).expect(200)).body,
    );
    expect(list.items[0]).toMatchObject({ skippedForQuota: 1 });
    expect(list.usage.used).toBe(2000);
    await db('automation_usage').updateOne(
      { workspaceId: new Types.ObjectId(workspaceId), month },
      { $set: { used: 0 } },
    );
  });

  it('fails a step naming a member who left, and pauses itself after 20 failures in a row', async () => {
    const form = await formSite();
    const automation = await create(form.site, 'assign_new_leads');
    const gone = new Types.ObjectId();
    await db<AutomationRecord>('automations').updateOne(
      { _id: new Types.ObjectId(automation.id) },
      { $set: { 'definition.actions': [{ kind: 'assign', memberIds: [gone.toHexString()] }] } },
    );
    await enable(form.site, automation.id);
    await db<AutomationRecord>('automations').updateOne(
      { _id: new Types.ObjectId(automation.id) },
      { $set: { consecutiveFailures: 19 } },
    );
    await send(form, { name: 'Hồ Gia Bảo', phone: '0905 333 444' });
    const [run] = await settle(automation.id);
    expect(run).toMatchObject({
      status: 'failed',
      steps: [{ status: 'failed', attempts: 1, error: { code: 'member_gone' } }],
    });
    const stored = await db<AutomationRecord>('automations').findOne({
      _id: new Types.ObjectId(automation.id),
    });
    expect(stored).toMatchObject({
      state: 'paused',
      pausedReason: 'errors',
      consecutiveFailures: 20,
    });
    const activity = await db('activity').findOne({
      siteId: new Types.ObjectId(form.site.id),
      type: 'automation.auto_paused',
    });
    expect(activity).not.toBeNull();
    // "Bật lại automation" starts the count again.
    await db<AutomationRecord>('automations').updateOne(
      { _id: new Types.ObjectId(automation.id) },
      { $set: { 'definition.actions': [{ kind: 'add_tag', tag: 'Mới' }] } },
    );
    await enable(form.site, automation.id);
    const again = await db<AutomationRecord>('automations').findOne({
      _id: new Types.ObjectId(automation.id),
    });
    expect(again).toMatchObject({ state: 'on', pausedReason: null, consecutiveFailures: 0 });
  });

  it('runs each event once with two instances, woken by the change stream alone', async () => {
    const second = await createSecondInstance(t);
    try {
      const form = await formSite();
      const automation = await create(form.site, 'assign_new_leads');
      await enable(form.site, automation.id);
      await send(form, { name: 'Ngô Bảo Châu', phone: '0933 444 555' });
      // Nobody calls `wake`: the instances' timers and streams pick the run up.
      let runs: AutomationRunRecord[] = [];
      for (let wait = 0; wait < 200; wait += 1) {
        runs = await db<AutomationRunRecord>('automation_runs')
          .find({ automationId: new Types.ObjectId(automation.id) })
          .toArray();
        if (runs.length === 1 && runs[0]?.status === 'succeeded') {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(runs.map((run) => run.status)).toEqual(['succeeded']);
      const contact = await contactOf(form.site);
      if (contact === null) {
        throw new Error('No contact');
      }
      expect(await db<TaskRecord>('tasks').countDocuments({ contactId: contact._id })).toBe(1);
    } finally {
      await second.app.close();
    }
  });
});
