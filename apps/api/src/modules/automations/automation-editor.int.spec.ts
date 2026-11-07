import {
  type AutomationDetail,
  automationActivationSchema,
  automationDetailSchema,
  automationListItemSchema,
  type PublicLeadRequest,
  type Site,
  testAutomationResponseSchema,
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
import type { ContactRecord } from '../contacts/contact.schema.js';
import type { AutomationRunRecord } from './automation.schema.js';
import { AutomationScheduler } from './automation-scheduler.service.js';

/** Board 26 (ADR-034): the steps saved as versions, "Chạy thử" and "Bật". */
describe('automation editor', () => {
  let t: TestApp;
  let owner: TestClient;
  let ownerId: string;
  let workspaceId: string;

  beforeAll(async () => {
    t = await createTestApp('plp_test_automation_editor', {
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
    pageId: string;
    releaseId: string;
  }

  async function formSite(): Promise<FormSite> {
    const site = await createSite(owner, workspaceId);
    await configurePrivacy(owner, site.id);
    await addConfirmedRecipient(t, owner, site.id);
    const slug = uniqueSlug('uu-dai');
    const { pageId, published } = await createLiveFormPage(
      owner,
      site.id,
      slug,
      formDraft(slug, leadFormSection()),
    );
    return { site, pageId, releaseId: published.release.id };
  }

  async function send(form: FormSite, overrides: Partial<PublicLeadRequest> = {}): Promise<void> {
    await submitLead(t, form.site.subdomain, leadBody(form.releaseId, overrides)).expect(201);
  }

  async function blank(site: Site): Promise<AutomationDetail> {
    const created = automationListItemSchema.parse(
      (await owner.post(`/sites/${site.id}/automations`, {}).expect(201)).body,
    );
    return automationDetailSchema.parse(
      (await owner.get(`/sites/${site.id}/automations/${created.id}`).expect(200)).body,
    );
  }

  function db<T extends object>(name: string) {
    return t.workspaceDb(workspaceId).collection<T>(name);
  }

  it('starts blank, offers the site’s members and pages, and saves each change as a version', async () => {
    const form = await formSite();
    const automation = await blank(form.site);
    expect(automation).toMatchObject({
      name: 'Automation mới',
      state: 'draft',
      version: 1,
      missing: 1,
      definition: { trigger: { kind: 'lead_created', pageIds: [] }, conditions: [], actions: [] },
      options: { members: [{ id: ownerId }], pages: [{ id: form.pageId }] },
    });
    const base = `/sites/${form.site.id}/automations/${automation.id}`;
    const saved = automationDetailSchema.parse(
      (
        await owner
          .patch(base, {
            name: 'Báo quản lý khi chốt',
            definition: {
              trigger: { kind: 'opportunity_stage_changed', stage: 'won' },
              conditions: [{ kind: 'opportunity_value_at_least', value: 10_000_000 }],
              actions: [{ kind: 'email', to: [ownerId], subject: 'Đã chốt «Tên khách»' }],
            },
          })
          .expect(200)
      ).body,
    );
    expect(saved).toMatchObject({ name: 'Báo quản lý khi chốt', version: 2, missing: 0 });
    expect(saved.trigger).toEqual({ kind: 'opportunity_stage_changed', stage: 'won' });
    await owner
      .patch(base, {
        definition: {
          trigger: { kind: 'lead_still_new', minutes: 7 },
          conditions: [],
          actions: [],
        },
      })
      .expect(422);
    await owner.patch(base, { name: '' }).expect(422);
    const support = await addMember(t, workspaceId, 'support');
    await support.client.get(base).expect(200);
    await support.client.patch(base, { name: 'Khác' }).expect(403);
    await support.client
      .post(`${base}/test`, { definition: saved.definition, source: 'sample' })
      .expect(403);
  });

  it('tries the steps on the latest lead or a sample, without doing any of them', async () => {
    const form = await formSite();
    await send(form, {
      name: 'Phạm Mỹ Duyên',
      phone: '0977 645 010',
      source: { utmSource: 'facebook', utmMedium: 'cpc', utmCampaign: null, referrer: null },
    });
    const automation = await blank(form.site);
    const definition = {
      trigger: { kind: 'lead_created', pageIds: [] },
      conditions: [{ kind: 'source_contains', field: 'source', text: 'facebook' }],
      actions: [
        { kind: 'assign', memberIds: [ownerId] },
        { kind: 'create_task', title: 'Gọi lại', dueInMinutes: 15, assignee: 'owner' },
        { kind: 'email', to: [], subject: 'Lead mới' },
      ],
    };
    const base = `/sites/${form.site.id}/automations/${automation.id}`;
    const latest = testAutomationResponseSchema.parse(
      (await owner.post(`${base}/test`, { definition, source: 'latest' }).expect(200)).body,
    );
    expect(latest.lead?.name).toBe('Phạm Mỹ Duyên');
    expect(latest.trigger.outcome).toBe('pass');
    expect(latest.conditions).toEqual([
      { outcome: 'pass', text: 'Đạt: utm_source chứa “facebook”' },
    ]);
    expect(latest.actions.map((step) => step.outcome)).toEqual(['pass', 'pass', 'skip']);
    expect(latest.actions[2]?.text).toBe('Bỏ qua: thiếu người nhận');
    const sample = testAutomationResponseSchema.parse(
      (await owner.post(`${base}/test`, { definition, source: 'sample' }).expect(200)).body,
    );
    expect(sample.lead).toBeNull();

    // Nothing happened: no owner, no task, no run, no run counted.
    const contact = await db<ContactRecord>('contacts').findOne({
      siteId: new Types.ObjectId(form.site.id),
    });
    expect(contact?.ownerId ?? null).toBeNull();
    expect(await db('tasks').countDocuments({ siteId: new Types.ObjectId(form.site.id) })).toBe(0);
    expect(
      await db('automation_runs').countDocuments({ siteId: new Types.ObjectId(form.site.id) }),
    ).toBe(0);
  });

  it('enables with the recent leads without an owner when asked, each once', async () => {
    const form = await formSite();
    await send(form, { name: 'Lê Hoàng Nam', phone: '0938 222 104' });
    await send(form, { name: 'Trần Quốc Việt', phone: '0903 118 902' });
    // Việt already has an owner: the automation leaves him.
    const viet = await db<ContactRecord>('contacts').findOne({ name: 'Trần Quốc Việt' });
    await owner
      .patch(`/sites/${form.site.id}/contacts/${String(viet?._id)}`, { action: 'assign', ownerId })
      .expect(200);
    const created = automationListItemSchema.parse(
      (
        await owner
          .post(`/sites/${form.site.id}/automations`, { recipe: 'assign_new_leads' })
          .expect(201)
      ).body,
    );
    const base = `/sites/${form.site.id}/automations/${created.id}`;
    const activation = automationActivationSchema.parse(
      (await owner.get(`${base}/activation`).expect(200)).body,
    );
    expect(activation).toEqual({ leads: 2, recentUnassigned: 1, canIncludeRecent: true });

    await owner.post(`${base}/state`, { state: 'on', includeRecent: true }).expect(200);
    // While it runs, its steps wait for "Tạm dừng"; its name does not.
    const detail = automationDetailSchema.parse((await owner.get(base).expect(200)).body);
    await owner.patch(base, { definition: detail.definition }).expect(409);
    await owner.patch(base, { name: 'Giao lead cho người trực' }).expect(200);
    await t.app.get(AutomationScheduler).wake();
    const runs = await db<AutomationRunRecord>('automation_runs')
      .find({ automationId: new Types.ObjectId(created.id) })
      .toArray();
    expect(runs).toHaveLength(1);
    const nam = await db<ContactRecord>('contacts').findOne({ name: 'Lê Hoàng Nam' });
    expect(runs[0]?.contactId?.toHexString()).toBe(nam?._id.toHexString());

    // A stage automation has no leads to pick up.
    const stage = await blank(form.site);
    const stageActivation = automationActivationSchema.parse(
      (
        await owner
          .patch(`/sites/${form.site.id}/automations/${stage.id}`, {
            definition: {
              trigger: { kind: 'opportunity_stage_changed', stage: null },
              conditions: [],
              actions: [{ kind: 'add_tag', tag: 'Đang chăm sóc' }],
            },
          })
          .expect(200)
          .then(() => owner.get(`/sites/${form.site.id}/automations/${stage.id}/activation`))
      ).body,
    );
    expect(stageActivation.canIncludeRecent).toBe(false);
  });
});
