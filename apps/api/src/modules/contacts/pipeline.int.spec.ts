import {
  contactListResponseSchema,
  contactProfileResponseSchema,
  type Opportunity,
  opportunitySchema,
  type PipelineResponse,
  pipelineResponseSchema,
  problemSchema,
  type PublicLeadRequest,
  type Site,
  leadDetailSchema,
  timelineResponseSchema,
} from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import { formDraft, leadFormSection } from '../../../test/compositions.js';
import {
  createLiveFormPage,
  insertLeads,
  leadBody,
  storedLead,
  submitLead,
} from '../../../test/leads.js';
import {
  RecordingRevalidationClient,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../../test/pages.js';
import { configurePrivacy } from '../../../test/privacy.js';
import { addConfirmedRecipient } from '../../../test/recipients.js';
import { addMember, createSite } from '../../../test/resources.js';
import type { LeadRecord } from '../leads/lead.schema.js';
import { ContactsBackfill } from './contacts-backfill.service.js';
import type { OpportunityRecord } from './opportunity.schema.js';
import type { TaskRecord } from './profile.schema.js';

const DAY_MS = 86_400_000;

/** The pipeline (board 24, ADR-033): opportunities, the fixed stages, and the lead's status. */
describe('pipeline', () => {
  let t: TestApp;
  let owner: TestClient;
  let ownerId: string;
  let workspaceId: string;

  beforeAll(async () => {
    t = await createTestApp('plp_test_pipeline', {
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
      formDraft(slug, leadFormSection({ showEmail: true })),
    );
    return { site, pageId, releaseId: published.release.id };
  }

  async function send(
    { site, releaseId }: FormSite,
    overrides: Partial<PublicLeadRequest> = {},
  ): Promise<void> {
    await submitLead(t, site.subdomain, leadBody(releaseId, overrides)).expect(201);
  }

  async function board(site: Site, query = '', client = owner): Promise<PipelineResponse> {
    const response = await client.get(`/sites/${site.id}/pipeline${query}`).expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    return pipelineResponseSchema.parse(response.body);
  }

  function cards(page: PipelineResponse, stage: string): Opportunity[] {
    return page.columns.find((column) => column.stage === stage)?.items ?? [];
  }

  function leadsDb() {
    return t.workspaceDb(workspaceId).collection<LeadRecord>('leads');
  }

  async function move(site: Site, id: string, body: Record<string, unknown>, status = 200) {
    return owner.post(`/sites/${site.id}/opportunities/${id}/stage`, body).expect(status);
  }

  it('opens a "Mới" opportunity named after the page; the person’s next lead joins it', async () => {
    const form = await formSite();
    await send(form, { name: 'Nguyễn Thu Trang', phone: '0912 345 678' });
    await send(form, { name: 'Trang', phone: '0912345678' });
    await send(form, { name: 'Bot', phone: '0938 000 111', honeypot: 'https://spam.example' });

    const page = await board(form.site);
    const [opportunity] = cards(page, 'new');
    expect(cards(page, 'new')).toHaveLength(1);
    expect(opportunity).toMatchObject({
      title: 'Đăng ký tư vấn',
      stage: 'new',
      value: null,
      contact: { name: 'Nguyễn Thu Trang' },
    });
    expect(page.summary).toEqual({ open: 1, openValue: 0, wonThisMonth: 0, lostThisMonth: 0 });
    const leads = await leadsDb()
      .find({ siteId: new Types.ObjectId(form.site.id) })
      .toArray();
    expect(leads.filter((lead) => lead.opportunityId).map((lead) => lead.status)).toEqual([
      'new',
      'new',
    ]);
    // Suspected spam opens nothing.
    expect(leads.find((lead) => lead.spam.suspected)?.opportunityId ?? null).toBeNull();
  });

  it('moves through the stages, the leads’ status following, refusing a card moved meanwhile', async () => {
    const form = await formSite();
    await send(form, { name: 'Lê Hoàng Nam', phone: '0903 111 222' });
    const [card] = cards(await board(form.site), 'new');
    if (!card) {
      throw new Error('No card');
    }
    const contacted = opportunitySchema.parse(
      (await move(form.site, card.id, { stage: 'contacted', from: 'new' })).body,
    );
    expect(contacted.stage).toBe('contacted');
    const stale = await move(form.site, card.id, { stage: 'scheduled', from: 'new' }, 409);
    expect(problemSchema.parse(stale.body).title).toBe('Cơ hội này vừa được chuyển giai đoạn');
    const lead = await leadsDb().findOne({ siteId: new Types.ObjectId(form.site.id) });
    expect(lead?.status).toBe('contacted');

    // The inbox changes the same stage.
    const detail = leadDetailSchema.parse(
      (
        await owner
          .patch(`/sites/${form.site.id}/leads/${String(lead?._id)}`, { status: 'scheduled' })
          .expect(200)
      ).body,
    );
    expect(detail).toMatchObject({ status: 'scheduled', opportunity: { id: card.id } });

    // "Thắng" needs the actual value and the day; "Mở lại" goes back to "Đã đến".
    await move(form.site, card.id, { stage: 'won', from: 'scheduled' }, 422);
    const won = opportunitySchema.parse(
      (
        await move(form.site, card.id, {
          stage: 'won',
          from: 'scheduled',
          value: 36_500_000,
          on: '2026-11-01',
        })
      ).body,
    );
    expect(won.won).toEqual({ value: 36_500_000, on: '2026-11-01' });
    const page = await board(form.site);
    expect(cards(page, 'won').map((item) => item.id)).toEqual([card.id]);
    expect(page.columns.find((column) => column.stage === 'won')?.total).toBe(36_500_000);
    expect(page.summary.wonThisMonth).toBe(1);
    const reopened = opportunitySchema.parse(
      (await move(form.site, card.id, { stage: 'visited', from: 'won' })).body,
    );
    expect(reopened).toMatchObject({ stage: 'visited', won: null });

    const contactId = card.contact.id;
    const timeline = timelineResponseSchema.parse(
      (await owner.get(`/sites/${form.site.id}/contacts/${contactId}/timeline`).expect(200)).body,
    );
    expect(
      timeline.items.flatMap((item) => (item.kind === 'stage' ? [[item.from, item.to]] : [])),
    ).toEqual([
      ['won', 'visited'],
      ['scheduled', 'won'],
      ['contacted', 'scheduled'],
      ['new', 'contacted'],
      [null, 'new'],
    ]);
  });

  it('marks lost with a reason, closing the opportunity’s open tasks', async () => {
    const form = await formSite();
    await send(form, { name: 'Đặng Minh Tú', phone: '0904 222 333' });
    const [card] = cards(await board(form.site), 'new');
    if (!card) {
      throw new Error('No card');
    }
    const base = `/sites/${form.site.id}/contacts/${card.contact.id}`;
    await owner
      .post(`${base}/tasks`, {
        title: 'Gửi báo giá',
        dueAt: new Date(Date.now() - DAY_MS).toISOString(),
        assigneeId: ownerId,
      })
      .expect(201);
    expect(cards(await board(form.site), 'new')[0]?.next?.title).toBe('Gửi báo giá');

    await move(form.site, card.id, { stage: 'lost', from: 'new', reason: 'bogus', note: '' }, 422);
    const lost = opportunitySchema.parse(
      (
        await move(form.site, card.id, {
          stage: 'lost',
          from: 'new',
          reason: 'chose_elsewhere',
          note: 'Chọn phòng khám gần nhà',
        })
      ).body,
    );
    expect(lost.lost).toEqual({ reason: 'chose_elsewhere', note: 'Chọn phòng khám gần nhà' });
    const tasks = await t
      .workspaceDb(workspaceId)
      .collection<TaskRecord>('tasks')
      .find({ contactId: new Types.ObjectId(card.contact.id) })
      .toArray();
    expect(tasks.map((task) => task.doneAt !== null)).toEqual([true]);
    const page = await board(form.site);
    expect(page.summary).toMatchObject({ open: 0, lostThisMonth: 1 });
    expect(cards(page, 'lost').map((item) => item.id)).toEqual([card.id]);

    // The person's next lead opens a new opportunity: the lost one is closed.
    await send(form, { name: 'Đặng Minh Tú', phone: '0904 222 333' });
    expect(cards(await board(form.site), 'new')).toHaveLength(1);
  });

  it('creates opportunities by hand and for selected profiles, shown on the list and the profile', async () => {
    const form = await formSite();
    const created = await owner
      .post(`/sites/${form.site.id}/contacts`, {
        name: 'Hồ Gia Bảo',
        phone: '0905 333 444',
        channel: 'walk_in',
        marketing: false,
      })
      .expect(200);
    const bao = (created.body as { contact: { id: string } }).contact.id;
    await send(form, { name: 'Võ Ngọc Hân', phone: '0906 444 555' });
    await owner
      .patch(`/sites/${form.site.id}/contacts/${bao}`, { action: 'assign', ownerId })
      .expect(200);

    const one = opportunitySchema.parse(
      (
        await owner
          .post(`/sites/${form.site.id}/opportunities`, {
            contactId: bao,
            title: 'Bọc răng sứ 6 răng',
            value: 30_000_000,
          })
          .expect(201)
      ).body,
    );
    expect(one).toMatchObject({
      stage: 'new',
      value: 30_000_000,
      valueBy: { id: ownerId },
      owner: { id: ownerId },
    });
    await owner
      .post(`/sites/${form.site.id}/opportunities`, {
        contactId: bao,
        title: 'x',
        value: 20_000_000_000,
      })
      .expect(422);

    const list = contactListResponseSchema.parse(
      (await owner.get(`/sites/${form.site.id}/contacts?view=all`).expect(200)).body,
    );
    const ids = list.items.map((item) => item.id);
    const bulk = await owner
      .post(`/sites/${form.site.id}/opportunities/bulk`, {
        contactIds: ids,
        title: 'Tẩy trắng răng',
        value: null,
      })
      .expect(200);
    expect(bulk.body).toEqual({ created: 2 });
    const page = await board(form.site);
    expect(page.summary.open).toBe(4);
    expect(page.summary.openValue).toBe(30_000_000);
    expect((await board(form.site, `?ownerId=${ownerId}`)).summary.open).toBe(2);

    const after = contactListResponseSchema.parse(
      (await owner.get(`/sites/${form.site.id}/contacts?view=all`).expect(200)).body,
    );
    expect(after.items.map((item) => item.opportunity?.stage)).toEqual(['new', 'new']);
    const profile = contactProfileResponseSchema.parse(
      (await owner.get(`/sites/${form.site.id}/contacts/${bao}`).expect(200)).body,
    );
    expect(profile.opportunities.map((item) => item.title).sort()).toEqual([
      'Bọc răng sứ 6 răng',
      'Tẩy trắng răng',
    ]);

    const edited = opportunitySchema.parse(
      (
        await owner
          .patch(`/sites/${form.site.id}/opportunities/${one.id}`, { value: 28_000_000 })
          .expect(200)
      ).body,
    );
    expect(edited.value).toBe(28_000_000);
    const elsewhere = await createSite(owner, workspaceId);
    const outside = await addMember(t, workspaceId, 'support', [elsewhere.id]);
    await owner
      .patch(`/sites/${form.site.id}/opportunities/${one.id}`, { ownerId: outside.me.user.id })
      .expect(422);
  });

  it('gives leads stored before K3 an opportunity of their stage, "Chưa liên lạc được" as lost, once', async () => {
    const form = await formSite();
    const base = {
      workspaceId,
      siteId: form.site.id,
      pageId: form.pageId,
      releaseId: form.releaseId,
    };
    await insertLeads(t, [
      storedLead({
        ...base,
        name: 'Hồ Văn Lâm',
        phone: '+84913000011',
        status: 'scheduled',
        createdAt: new Date(Date.now() - 3 * DAY_MS),
      }),
      storedLead({
        ...base,
        name: 'Trần Mai',
        phone: '+84913000012',
        status: 'unreachable',
        createdAt: new Date(Date.now() - 2 * DAY_MS),
      }),
      storedLead({
        ...base,
        name: 'Phan Anh',
        phone: '+84913000013',
        status: 'won',
        createdAt: new Date(Date.now() - DAY_MS),
      }),
    ]);
    const backfill = t.app.get(ContactsBackfill);
    const ref = { workspaceId: new Types.ObjectId(workspaceId) };
    expect(await backfill.runWorkspace(ref, new Date())).toBe(3);
    expect(await backfill.runWorkspace(ref, new Date())).toBe(0);
    const stored = await t
      .workspaceDb(workspaceId)
      .collection<OpportunityRecord>('opportunities')
      .find({ siteId: new Types.ObjectId(form.site.id) })
      .sort({ createdAt: 1 })
      .toArray();
    expect(stored.map((item) => [item.stage, item.lost?.reason ?? null])).toEqual([
      ['scheduled', null],
      ['lost', 'unreachable'],
      ['won', null],
    ]);
    const leads = await leadsDb()
      .find({ siteId: new Types.ObjectId(form.site.id) })
      .toArray();
    expect(leads.map((lead) => lead.status).sort()).toEqual(['lost', 'scheduled', 'won']);
  });

  it('deletes a person’s opportunities with them, and keeps the pipeline to its members', async () => {
    const form = await formSite();
    await send(form, { name: 'Bùi Thanh Hương', phone: '0907 555 666' });
    const [card] = cards(await board(form.site), 'new');
    if (!card) {
      throw new Error('No card');
    }
    const stranger = await signedUpClient(t.app);
    await stranger.client.get(`/sites/${form.site.id}/pipeline`).expect(404);
    await stranger.client
      .post(`/sites/${form.site.id}/opportunities/${card.id}/stage`, {
        stage: 'contacted',
        from: 'new',
      })
      .expect(404);
    const other = await createSite(owner, workspaceId);
    await move(other, card.id, { stage: 'contacted', from: 'new' }, 404);
    const editor = await addMember(t, workspaceId, 'editor');
    await editor.client.get(`/sites/${form.site.id}/pipeline`).expect(403);
    const support = await addMember(t, workspaceId, 'support');
    await support.client
      .post(`/sites/${form.site.id}/opportunities/${card.id}/stage`, {
        stage: 'contacted',
        from: 'new',
      })
      .expect(200);

    await owner
      .post(`/sites/${form.site.id}/contacts/${card.contact.id}/delete`, { requestId: null })
      .expect(200);
    expect(
      await t
        .workspaceDb(workspaceId)
        .collection('opportunities')
        .countDocuments({ siteId: new Types.ObjectId(form.site.id) }),
    ).toBe(0);
    expect((await board(form.site)).summary.open).toBe(0);
  });
});
