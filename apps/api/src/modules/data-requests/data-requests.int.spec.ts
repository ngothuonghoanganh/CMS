import {
  activityListResponseSchema,
  businessDeadline,
  type CreateDataRequestRequest,
  DATA_REQUEST_LOG_MAX,
  type DataRequestDetail,
  dataRequestDetailSchema,
  dataRequestListResponseSchema,
  leadDetailSchema,
  leadListResponseSchema,
  personExportFileSchema,
  problemSchema,
  type Site,
} from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import { createLiveFormPage, insertLeads, storedLead } from '../../../test/leads.js';
import {
  RecordingRevalidationClient,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../../test/pages.js';
import { configurePrivacy } from '../../../test/privacy.js';
import { addConfirmedRecipient } from '../../../test/recipients.js';
import { addEditor, createSite } from '../../../test/resources.js';

const DAY_MS = 86_400_000;
const PHONE = '+84987106223';
const EMAIL = 'mai.anh@gmail.com';

/** Requests from people who sent a form (board 12, ADR-017): record, answer, handle, complete. */
describe('data requests', () => {
  let t: TestApp;
  let owner: TestClient;
  let ownerId: string;
  let editor: TestClient;
  let workspaceId: string;

  beforeAll(async () => {
    t = await createTestApp(
      'plp_test_data_requests',
      withRevalidationRecorder(new RecordingRevalidationClient()),
    );
    const signedUp = await signedUpClient(t.app);
    owner = signedUp.client;
    ownerId = signedUp.me.user.id;
    workspaceId = signedUp.workspaceId;
    editor = (await addEditor(t, workspaceId)).client;
  });

  afterAll(async () => {
    await t.close();
  });

  interface FormSite {
    site: Site;
    ids: { workspaceId: string; siteId: string; pageId: string; releaseId: string };
  }

  async function formSite(): Promise<FormSite> {
    const site = await createSite(owner, workspaceId);
    await configurePrivacy(owner, site.id);
    await addConfirmedRecipient(t, owner, site.id);
    const { pageId, published } = await createLiveFormPage(owner, site.id, uniqueSlug('tu-van'));
    return {
      site,
      ids: { workspaceId, siteId: site.id, pageId, releaseId: published.release.id },
    };
  }

  /**
   * Four leads: two with the person's phone number (one also with their email), one with another
   * number but their email, and one of someone else.
   */
  async function seedPerson({ ids }: FormSite): Promise<void> {
    await insertLeads(t, [
      storedLead({ ...ids, name: 'Lê Mai Anh', phone: PHONE, email: EMAIL, marketing: true }),
      storedLead({ ...ids, name: 'Lê Mai Anh', phone: PHONE }),
      storedLead({ ...ids, name: 'Mai Anh', phone: '+84909000111', email: EMAIL, marketing: true }),
      storedLead({ ...ids, name: 'Phạm Gia Huy', phone: '+84912448019', marketing: true }),
    ]);
  }

  function requestBody(
    overrides: Partial<CreateDataRequestRequest> = {},
  ): CreateDataRequestRequest {
    return {
      name: 'Lê Mai Anh',
      phone: '0987 106 223',
      email: '',
      type: 'delete',
      receivedAt: new Date(Date.now() - 2 * DAY_MS).toISOString(),
      ...overrides,
    };
  }

  async function record(
    site: Site,
    overrides: Partial<CreateDataRequestRequest> = {},
  ): Promise<DataRequestDetail> {
    const response = await owner
      .post(`/sites/${site.id}/data-requests`, requestBody(overrides))
      .expect(201);
    return dataRequestDetailSchema.parse(response.body);
  }

  async function step(
    requestId: string,
    name: 'respond' | 'complete',
    status = 200,
  ): Promise<DataRequestDetail | null> {
    const response = await owner.post(`/data-requests/${requestId}/${name}`).expect(status);
    return status === 200 ? dataRequestDetailSchema.parse(response.body) : null;
  }

  async function names(site: Site): Promise<string[]> {
    const list = leadListResponseSchema.parse(
      (await owner.get(`/sites/${site.id}/leads?range=all`).expect(200)).body,
    );
    return list.items.map((item) => item.name).sort();
  }

  async function activity(site: Site) {
    const response = await owner
      .get(
        `/sites/${site.id}/activity?types=data_request.created,data_request.completed,lead.person_deleted,lead.exported`,
      )
      .expect(200);
    return activityListResponseSchema
      .parse(response.body)
      .items.map((item) => ({ type: item.type, count: item.data.count }));
  }

  it('records a request with its deadlines in working days and the leads it covers', async () => {
    const form = await formSite();
    await seedPerson(form);
    const receivedAt = new Date(Date.now() - 2 * DAY_MS);

    const created = await record(form.site, {
      email: 'Mai.Anh@Gmail.com',
      receivedAt: receivedAt.toISOString(),
    });

    expect(created).toMatchObject({
      contact: { name: 'Lê Mai Anh', phone: PHONE, email: EMAIL },
      masked: false,
      type: 'delete',
      status: 'open',
      receivedAt: receivedAt.toISOString(),
      respondBy: businessDeadline(receivedAt, 2).toISOString(),
      completeBy: businessDeadline(receivedAt, 20).toISOString(),
      respondedAt: null,
      completedAt: null,
      // Matched by phone number or by email, Phạm Gia Huy left out.
      leads: { count: 3, capped: false },
      completedCount: null,
    });
    expect(created.matches.map((lead) => lead.name).sort()).toEqual([
      'Lê Mai Anh',
      'Lê Mai Anh',
      'Mai Anh',
    ]);
    expect(
      created.log.map((entry) => ({
        actor: entry.actor.id,
        action: entry.action,
        count: entry.count,
      })),
    ).toEqual([{ actor: ownerId, action: 'created', count: null }]);
    expect(await activity(form.site)).toEqual([{ type: 'data_request.created', count: null }]);

    const list = dataRequestListResponseSchema.parse(
      (await owner.get(`/sites/${form.site.id}/data-requests`).expect(200)).body,
    );
    expect(list.items).toEqual([
      expect.objectContaining({ id: created.id, leads: { count: 3, capped: false } }),
    ]);
  });

  it('counts the leads of each request of a page in one go', async () => {
    const form = await formSite();
    await seedPerson(form);
    await record(form.site, { name: '', phone: '', email: EMAIL, type: 'access' });
    await record(form.site, { name: 'Phạm Gia Huy', phone: '0912 448 019', type: 'rectify' });
    await record(form.site, { name: 'Không có lead', phone: '0933 000 999', type: 'rectify' });

    const first = dataRequestListResponseSchema.parse(
      (await owner.get(`/sites/${form.site.id}/data-requests?limit=2`).expect(200)).body,
    );
    expect(first.items.map((item) => [item.contact.name, item.leads?.count])).toEqual([
      ['Không có lead', 0],
      ['Phạm Gia Huy', 1],
    ]);
    expect(first.nextCursor).not.toBeNull();
    const second = dataRequestListResponseSchema.parse(
      (
        await owner
          .get(`/sites/${form.site.id}/data-requests?limit=2&cursor=${first.nextCursor ?? ''}`)
          .expect(200)
      ).body,
    );
    expect(second.items.map((item) => [item.contact.email, item.leads?.count])).toEqual([
      [EMAIL, 2],
    ]);
    expect(second.nextCursor).toBeNull();
  });

  it('records requests received in the last 30 days only, and needs a phone or an email', async () => {
    const form = await formSite();
    const tooOld = await owner
      .post(
        `/sites/${form.site.id}/data-requests`,
        requestBody({ receivedAt: new Date(Date.now() - 31 * DAY_MS).toISOString() }),
      )
      .expect(422);
    expect(problemSchema.parse(tooOld.body).issues).toEqual([
      expect.objectContaining({
        path: ['receivedAt'],
        message: 'Chỉ ghi nhận được yêu cầu nhận trong 30 ngày qua',
      }),
    ]);
    const future = await owner
      .post(
        `/sites/${form.site.id}/data-requests`,
        requestBody({ receivedAt: new Date(Date.now() + DAY_MS).toISOString() }),
      )
      .expect(422);
    expect(problemSchema.parse(future.body).issues?.[0]?.path).toEqual(['receivedAt']);
    const nobody = await owner
      .post(`/sites/${form.site.id}/data-requests`, requestBody({ phone: '', email: '' }))
      .expect(422);
    expect(problemSchema.parse(nobody.body).issues?.[0]?.path).toEqual(['phone']);
  });

  it('answers a request once, completes it, then takes no further step', async () => {
    const form = await formSite();
    await seedPerson(form);
    const request = await record(form.site, { type: 'rectify' });

    const responded = await step(request.id, 'respond');
    expect(responded?.status).toBe('responded');
    expect(responded?.respondedAt).not.toBeNull();
    expect(responded?.log.map((entry) => entry.action)).toEqual(['created', 'responded']);
    const again = await owner.post(`/data-requests/${request.id}/respond`).expect(409);
    expect(problemSchema.parse(again.body).title).toBe('Yêu cầu này đã được phản hồi');

    const completed = await step(request.id, 'complete');
    expect(completed?.completedAt).not.toBeNull();
    expect(completed).toMatchObject({
      status: 'completed',
      respondedAt: responded?.respondedAt,
      completedCount: null,
      masked: false,
      // By phone number only: the lead with the email and another number is not theirs.
      leads: { count: 2, capped: false },
    });
    expect(completed?.log.map((entry) => entry.action)).toEqual([
      'created',
      'responded',
      'completed',
    ]);
    for (const name of ['respond', 'complete'] as const) {
      const refused = await owner.post(`/data-requests/${request.id}/${name}`).expect(409);
      expect(problemSchema.parse(refused.body).title).toBe('Yêu cầu này đã hoàn tất');
    }
    // A rectification changes nothing by itself: the owner corrected the leads.
    expect(await names(form.site)).toEqual(['Lê Mai Anh', 'Lê Mai Anh', 'Mai Anh', 'Phạm Gia Huy']);
  });

  it('deletes the person’s leads and masks the contact when a deletion is completed', async () => {
    const form = await formSite();
    await seedPerson(form);
    const request = await record(form.site, { email: EMAIL });

    const completed = await step(request.id, 'complete');

    expect(completed).toMatchObject({
      status: 'completed',
      masked: true,
      contact: { name: 'L. M. A.', phone: '0987 *** 223', email: 'ma***@gmail.com' },
      leads: null,
      completedCount: 3,
      matches: [],
    });
    // Completing counts as answering.
    expect(completed?.respondedAt).toBe(completed?.completedAt);
    expect(completed?.log.at(-1)).toMatchObject({ action: 'completed', count: 3 });
    expect(await names(form.site)).toEqual(['Phạm Gia Huy']);
    expect(await activity(form.site)).toEqual([
      { type: 'data_request.completed', count: 3 },
      { type: 'lead.person_deleted', count: 3 },
      { type: 'data_request.created', count: null },
    ]);
    // Nothing of the person is left in the stored request.
    const stored = await t.connection
      .collection('data_requests')
      .findOne({ _id: new Types.ObjectId(request.id) });
    expect(stored?.['search']).toBeNull();
    const text = JSON.stringify(stored);
    for (const trace of ['987106223', 'mai.anh', 'Lê Mai Anh']) {
      expect(text).not.toContain(trace);
    }
    const list = dataRequestListResponseSchema.parse(
      (await owner.get(`/sites/${form.site.id}/data-requests`).expect(200)).body,
    );
    expect(list.items[0]).toMatchObject({ masked: true, leads: null, completedCount: 3 });
  });

  it('masks the person’s other requests when their data is deleted', async () => {
    const form = await formSite();
    await seedPerson(form);
    const seen = await record(form.site, { email: EMAIL, type: 'access' });
    await step(seen.id, 'complete');
    const pending = await record(form.site, {
      name: '',
      phone: '',
      email: EMAIL,
      type: 'withdraw_marketing',
    });
    const someoneElse = await record(form.site, {
      name: 'Phạm Gia Huy',
      phone: '0912 448 019',
      type: 'rectify',
    });
    const deletion = await record(form.site, { email: EMAIL });

    await step(deletion.id, 'complete');

    const stored = await t.connection
      .collection('data_requests')
      .find({ siteId: new Types.ObjectId(form.site.id) })
      .toArray();
    const byId = new Map(stored.map((doc) => [String(doc['_id']), doc]));
    for (const id of [seen.id, pending.id, deletion.id]) {
      const doc = byId.get(id);
      expect(doc).toMatchObject({ masked: true, search: null });
      const text = JSON.stringify(doc);
      for (const trace of ['987106223', 'mai.anh', 'Lê Mai Anh']) {
        expect(text).not.toContain(trace);
      }
    }
    // Still open: the owner answers it, but nothing of the person is left to export or change.
    expect(byId.get(pending.id)).toMatchObject({
      status: 'open',
      contact: { email: 'ma***@gmail.com' },
    });
    expect(byId.get(someoneElse.id)).toMatchObject({
      masked: false,
      contact: { name: 'Phạm Gia Huy' },
    });
    const list = dataRequestListResponseSchema.parse(
      (await owner.get(`/sites/${form.site.id}/data-requests`).expect(200)).body,
    );
    expect(list.items.find((item) => item.id === pending.id)).toMatchObject({
      masked: true,
      leads: null,
    });
  });

  it('masks the person’s requests when their data is deleted from the inbox', async () => {
    const form = await formSite();
    await seedPerson(form);
    const request = await record(form.site, { type: 'rectify' });
    const lead = leadListResponseSchema
      .parse((await owner.get(`/sites/${form.site.id}/leads?range=all`).expect(200)).body)
      .items.find((item) => item.name === 'Lê Mai Anh');
    if (!lead) {
      throw new Error('Lê Mai Anh was not stored');
    }

    // A lead with the requested phone number: the same person as the request.
    await owner.delete(`/leads/${lead.id}/person`).expect(200);

    const masked = dataRequestDetailSchema.parse(
      (await owner.get(`/data-requests/${request.id}`).expect(200)).body,
    );
    expect(masked).toMatchObject({
      masked: true,
      status: 'open',
      contact: { name: 'L. M. A.', phone: '0987 *** 223', email: null },
      leads: null,
      matches: [],
    });
  });

  it('counts at most 999+ leads per person in the list, and each lead once', async () => {
    const form = await formSite();
    await insertLeads(
      t,
      Array.from({ length: 1001 }, (_, index) =>
        storedLead({ ...form.ids, name: `Khách ${String(index)}`, phone: PHONE, email: EMAIL }),
      ),
    );
    await record(form.site, { email: EMAIL });
    await record(form.site, { name: 'Không có lead', phone: '0933 000 999', type: 'rectify' });
    const list = dataRequestListResponseSchema.parse(
      (await owner.get(`/sites/${form.site.id}/data-requests`).expect(200)).body,
    );
    expect(list.items.map((item) => item.leads)).toEqual([
      { count: 0, capped: false },
      { count: 999, capped: true },
    ]);
  });

  it('deletes once when two completions of a deletion race', async () => {
    const form = await formSite();
    await seedPerson(form);
    const request = await record(form.site);
    const statuses = (
      await Promise.all([
        owner.post(`/data-requests/${request.id}/complete`),
        owner.post(`/data-requests/${request.id}/complete`),
      ])
    )
      .map((response) => response.status)
      .sort();
    expect(statuses).toEqual([200, 409]);
    expect(
      (await activity(form.site)).filter((item) => item.type === 'lead.person_deleted'),
    ).toEqual([{ type: 'lead.person_deleted', count: 2 }]);
  });

  it('records the withdrawn marketing consent on the person’s leads', async () => {
    const form = await formSite();
    await seedPerson(form);
    // Withdrawn by an earlier request: that date is the evidence and stays.
    const earlier = new Date('2026-10-01T03:00:00.000Z');
    await insertLeads(t, [
      storedLead({
        ...form.ids,
        name: 'Lê Mai Anh (cũ)',
        phone: PHONE,
        marketing: true,
        marketingWithdrawnAt: earlier,
      }),
    ]);
    const request = await record(form.site, { email: EMAIL, type: 'withdraw_marketing' });

    const completed = await step(request.id, 'complete');

    // The two leads of the person that still had it; Phạm Gia Huy keeps his.
    expect(completed).toMatchObject({ completedCount: 2, masked: false });
    const withdrawnNow = completed?.matches.filter(
      (lead) => lead.marketingWithdrawnAt === completed.completedAt,
    );
    expect(withdrawnNow?.map((lead) => lead.name).sort()).toEqual(['Lê Mai Anh', 'Mai Anh']);
    expect(
      completed?.matches.find((lead) => lead.name === 'Lê Mai Anh (cũ)')?.marketingWithdrawnAt,
    ).toBe(earlier.toISOString());
    const other = await t.connection
      .collection('leads')
      .findOne({ 'fields.name': 'Phạm Gia Huy', siteId: new Types.ObjectId(form.site.id) });
    expect(other?.['consent']).toMatchObject({ marketing: true, marketingWithdrawnAt: null });
    expect(await activity(form.site)).toEqual([
      { type: 'data_request.completed', count: 2 },
      { type: 'data_request.created', count: null },
    ]);
  });

  it('exports the data of a person who asked to see it, and logs the export', async () => {
    const form = await formSite();
    await seedPerson(form);
    const request = await record(form.site, { phone: '', email: EMAIL, type: 'access' });

    const response = await owner
      .post(`/data-requests/${request.id}/export`, { format: 'json' })
      .expect(200);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="du-lieu-ca-nhan-/,
    );
    const file = personExportFileSchema.parse(JSON.parse(response.text));
    expect(file.leads.map((lead) => lead.name).sort()).toEqual(['Lê Mai Anh', 'Mai Anh']);
    const detail = dataRequestDetailSchema.parse(
      (await owner.get(`/data-requests/${request.id}`).expect(200)).body,
    );
    expect(detail.log.at(-1)).toMatchObject({ action: 'exported', count: 2 });
    expect((await activity(form.site))[0]).toEqual({ type: 'lead.exported', count: 2 });

    const rectify = await record(form.site, { type: 'rectify' });
    const refused = await owner
      .post(`/data-requests/${rectify.id}/export`, { format: 'csv' })
      .expect(409);
    expect(problemSchema.parse(refused.body).title).toBe(
      'Chỉ yêu cầu xem dữ liệu mới có file xuất',
    );
  });

  it('keeps the newest entries of a long log', async () => {
    const form = await formSite();
    const request = await record(form.site, { type: 'access' });
    const old = Array.from({ length: DATA_REQUEST_LOG_MAX }, (_, index) => ({
      at: new Date(Date.now() - (DATA_REQUEST_LOG_MAX - index) * 1000),
      actorId: new Types.ObjectId(ownerId),
      action: 'exported',
      count: index,
    }));
    await t.connection
      .collection('data_requests')
      .updateOne({ _id: new Types.ObjectId(request.id) }, { $set: { log: old } });

    const responded = await step(request.id, 'respond');
    expect(responded?.log).toHaveLength(DATA_REQUEST_LOG_MAX);
    expect(responded?.log[0]?.count).toBe(1);
    const completed = await step(request.id, 'complete');
    expect(completed?.log).toHaveLength(DATA_REQUEST_LOG_MAX);
    expect(completed?.log.slice(-2).map((entry) => entry.action)).toEqual([
      'responded',
      'completed',
    ]);
  });

  it('keeps people’s text literal when completing, even when it looks like an expression', async () => {
    const form = await formSite();
    // "$." in an update pipeline would be read as a field path without `$literal`.
    const request = await record(form.site, { name: '$log', email: 'x@vi-du.vn' });
    const completed = await step(request.id, 'complete');
    expect(completed?.contact).toEqual({
      name: '$.',
      phone: '0987 *** 223',
      email: 'x***@vi-du.vn',
    });
  });

  it('lets the owner only see and handle requests', async () => {
    const form = await formSite();
    const request = await record(form.site);
    await editor.get(`/sites/${form.site.id}/data-requests`).expect(403);
    await editor.post(`/sites/${form.site.id}/data-requests`, requestBody()).expect(403);
    await editor.get(`/data-requests/${request.id}`).expect(403);
    await editor.post(`/data-requests/${request.id}/respond`).expect(403);
    await editor.post(`/data-requests/${request.id}/export`, { format: 'json' }).expect(403);
    await editor.post(`/data-requests/${request.id}/complete`).expect(403);
    expect((await step(request.id, 'respond'))?.status).toBe('responded');
  });

  it('answers with no-store: a request holds personal data', async () => {
    const form = await formSite();
    const request = await record(form.site);
    for (const path of [`/sites/${form.site.id}/data-requests`, `/data-requests/${request.id}`]) {
      const response = await owner.get(path).expect(200);
      expect(response.headers['cache-control']).toBe('no-store');
    }
  });

  describe('correcting a lead (owner only)', () => {
    it('changes the name, phone number and email, and finds the lead by them', async () => {
      const form = await formSite();
      await seedPerson(form);
      const lead = leadListResponseSchema
        .parse((await owner.get(`/sites/${form.site.id}/leads?range=all`).expect(200)).body)
        .items.find((item) => item.name === 'Phạm Gia Huy');
      if (!lead) {
        throw new Error('Phạm Gia Huy was not stored');
      }

      const stored = { _id: new Types.ObjectId(lead.id) };
      const before = await t.connection.collection('leads').findOne(stored);

      const response = await owner
        .patch(`/leads/${lead.id}/contact`, {
          name: 'Phạm Huy Hoàng',
          phone: '0912 448 020',
          email: 'Huy.Pham@Gmail.com',
        })
        .expect(200);

      expect(response.headers['cache-control']).toBe('no-store');
      expect(leadDetailSchema.parse(response.body)).toMatchObject({
        name: 'Phạm Huy Hoàng',
        phone: '+84912448020',
        email: 'huy.pham@gmail.com',
        personLeads: { count: 1, capped: false },
      });
      async function search(q: string): Promise<string[]> {
        const list = leadListResponseSchema.parse(
          (await owner.post(`/sites/${form.site.id}/leads/search`, { q, range: 'all' }).expect(200))
            .body,
        );
        return list.items.map((item) => item.id);
      }
      expect(await search('0912 448 020')).toEqual([lead.id]);
      expect(await search('pham huy hoang')).toEqual([lead.id]);
      expect(await search('Phạm Gia Huy')).toEqual([]);
      // The consent evidence is what the visitor agreed to; correcting the contact leaves it.
      const after = await t.connection.collection('leads').findOne(stored);
      expect(after?.['consent']).toEqual(before?.['consent']);
      expect(after?.['releaseId']).toEqual(before?.['releaseId']);
      const request = await record(form.site, { name: '', phone: '', email: 'huy.pham@gmail.com' });
      expect(request.leads).toEqual({ count: 1, capped: false });
    });

    it('refuses an editor and a phone number a form would refuse', async () => {
      const form = await formSite();
      await seedPerson(form);
      const lead = leadListResponseSchema.parse(
        (await owner.get(`/sites/${form.site.id}/leads?range=all`).expect(200)).body,
      ).items[0];
      const body = { name: 'Lê Mai Anh', phone: '0987 106 224', email: '' };
      await editor.patch(`/leads/${lead?.id ?? ''}/contact`, body).expect(403);
      const invalid = await owner
        .patch(`/leads/${lead?.id ?? ''}/contact`, { ...body, phone: '12345' })
        .expect(422);
      expect(problemSchema.parse(invalid.body).issues?.[0]?.path).toEqual(['phone']);
    });
  });
});
