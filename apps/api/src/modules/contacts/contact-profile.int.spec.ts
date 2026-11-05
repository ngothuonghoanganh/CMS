import {
  contactDeletionPreviewSchema,
  contactExportFileSchema,
  contactListResponseSchema,
  contactMeetingSchema,
  contactProfileResponseSchema,
  contactProfileSchema,
  contactTaskSchema,
  createContactResponseSchema,
  dataRequestDetailSchema,
  deleteContactPersonResponseSchema,
  mergeSuggestionListResponseSchema,
  problemSchema,
  type PublicLeadRequest,
  type Site,
  type TimelineEntry,
  timelineEntrySchema,
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
import { configurePrivacy, PRIVACY_SETTINGS, savePrivacy } from '../../../test/privacy.js';
import { addConfirmedRecipient } from '../../../test/recipients.js';
import { addMember, createSite } from '../../../test/resources.js';
import type { LeadRecord } from '../leads/lead.schema.js';
import type { ContactRecord } from './contact.schema.js';
import type { ContactEventRecord, MeetingRecord, TaskRecord } from './profile.schema.js';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** A customer's profile (board 23, ADR-033): records, timeline, and the person's data. */
describe('contact profile', () => {
  let t: TestApp;
  let owner: TestClient;
  let ownerId: string;
  let workspaceId: string;

  beforeAll(async () => {
    t = await createTestApp('plp_test_contact_profile', {
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
      formDraft(slug, leadFormSection({ showEmail: true, showMessage: true })),
    );
    return { site, pageId, releaseId: published.release.id };
  }

  async function send(
    { site, releaseId }: FormSite,
    overrides: Partial<PublicLeadRequest> = {},
  ): Promise<void> {
    await submitLead(t, site.subdomain, leadBody(releaseId, overrides)).expect(201);
  }

  /** The only profile of the site, or the one with this name. */
  async function contactOf(site: Site, name?: string): Promise<string> {
    const response = await owner.get(`/sites/${site.id}/contacts`).expect(200);
    const page = contactListResponseSchema.parse(response.body);
    const item = name === undefined ? page.items[0] : page.items.find((c) => c.name === name);
    if (!item) {
      throw new Error(`No contact ${name ?? ''}`);
    }
    return item.id;
  }

  function db<T extends object>(name: string) {
    return t.workspaceDb(workspaceId).collection<T>(name);
  }

  function at(hoursFromNow: number): string {
    return new Date(Date.now() + hoursFromNow * HOUR_MS).toISOString();
  }

  async function timeline(site: Site, contactId: string, cursor?: string) {
    const query = cursor === undefined ? '' : `?cursor=${encodeURIComponent(cursor)}`;
    const response = await owner
      .get(`/sites/${site.id}/contacts/${contactId}/timeline${query}`)
      .expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    return timelineResponseSchema.parse(response.body);
  }

  it('reads the profile with its consent from the latest lead and what the member may do', async () => {
    const form = await formSite();
    await send(form, { name: 'Nguyễn Thu Trang', phone: '0912 345 678' });
    await send(form, {
      name: 'Trang',
      phone: '0912345678',
      email: 'trang@mail.vn',
      message: 'Trả góp được không?',
    });
    const contactId = await contactOf(form.site);

    const response = await owner.get(`/sites/${form.site.id}/contacts/${contactId}`).expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const { contact, tasks, meetings } = contactProfileResponseSchema.parse(response.body);
    const latest = await db<LeadRecord>('leads').findOne(
      { contactId: new Types.ObjectId(contactId) },
      { sort: { createdAt: -1, _id: -1 } },
    );
    expect(contact).toMatchObject({
      name: 'Nguyễn Thu Trang',
      phone: '+84912345678',
      email: 'trang@mail.vn',
      origin: { kind: 'lead' },
      leadCount: 2,
      consent: {
        processing: {
          leadId: String(latest?._id),
          version: 1,
          page: { id: form.pageId },
          pageVersion: 1,
        },
      },
      can: { handle: true, export: true, manage: true },
    });
    expect(tasks).toEqual([]);
    expect(meetings).toEqual([]);

    const support = await addMember(t, workspaceId, 'support');
    const seen = contactProfileResponseSchema.parse(
      (await support.client.get(`/sites/${form.site.id}/contacts/${contactId}`).expect(200)).body,
    );
    expect(seen.contact.can).toEqual({ handle: true, export: false, manage: false });

    // The later lead says it joined the profile by its number; the first created it.
    const page = await timeline(form.site, contactId);
    expect(page.items.map((item) => item.kind === 'lead' && item.joined)).toEqual([true, false]);
    expect(page.items[0]).toMatchObject({ kind: 'lead', message: 'Trả góp được không?' });
  });

  it('writes notes, tasks and meetings as interactions, and reads them back in order', async () => {
    const form = await formSite();
    await send(form, { name: 'Lê Văn Hùng', phone: '0903 111 222' });
    const contactId = await contactOf(form.site);
    const before = await db<ContactRecord>('contacts').findOne({
      _id: new Types.ObjectId(contactId),
    });
    const base = `/sites/${form.site.id}/contacts/${contactId}`;

    const note = timelineEntrySchema.parse(
      (await owner.post(`${base}/notes`, { text: '  Quan tâm Invisalign  ' }).expect(201)).body,
    );
    expect(note).toMatchObject({
      kind: 'note',
      text: 'Quan tâm Invisalign',
      actor: { id: ownerId },
    });
    const after = await db<ContactRecord>('contacts').findOne({
      _id: new Types.ObjectId(contactId),
    });
    expect(after?.lastActivityAt.getTime()).toBeGreaterThan(before?.lastActivityAt.getTime() ?? 0);
    expect(after?.expiresAt?.getTime()).toBeGreaterThan(before?.expiresAt?.getTime() ?? 0);
    const storedNote = await db<ContactEventRecord>('contact_events').findOne({
      _id: new Types.ObjectId(note.id),
    });
    expect(storedNote?.expiresAt).toEqual(after?.expiresAt);

    const late = contactTaskSchema.parse(
      (
        await owner
          .post(`${base}/tasks`, { title: 'Gọi xác nhận', dueAt: at(-1), assigneeId: ownerId })
          .expect(201)
      ).body,
    );
    const soon = contactTaskSchema.parse(
      (
        await owner
          .post(`${base}/tasks`, { title: 'Gửi bảng giá', dueAt: at(20), assigneeId: ownerId })
          .expect(201)
      ).body,
    );
    const done = contactTaskSchema.parse(
      (await owner.patch(`${base}/tasks/${soon.id}`, { done: true }).expect(200)).body,
    );
    expect(done.doneAt).not.toBeNull();

    const meeting = contactMeetingSchema.parse(
      (
        await owner
          .post(`${base}/meetings`, {
            at: at(48),
            place: 'Chi nhánh Quận 3',
            with: 'BS. Trần Minh',
            note: 'Khám và chụp phim 3D',
          })
          .expect(201)
      ).body,
    );

    const profile = contactProfileResponseSchema.parse((await owner.get(base).expect(200)).body);
    // Open tasks by due time, then the done ones.
    expect(profile.tasks.map((task) => [task.id, task.doneAt === null])).toEqual([
      [late.id, true],
      [soon.id, false],
    ]);
    expect(profile.tasks[0]?.assignee?.id).toBe(ownerId);
    expect(profile.meetings).toEqual([meeting]);

    const page = await timeline(form.site, contactId);
    expect(page.items.map((item) => item.kind)).toEqual(['meeting', 'note', 'lead']);
    expect(page.items[0]).toMatchObject({
      kind: 'meeting',
      meeting: { place: 'Chi nhánh Quận 3', with: 'BS. Trần Minh' },
    });
  });

  it('refuses tasks for someone who cannot see the site, meetings in the past, and bad input', async () => {
    const form = await formSite();
    await send(form, { name: 'Trần Thị Mai', phone: '0904 222 333' });
    const contactId = await contactOf(form.site);
    const base = `/sites/${form.site.id}/contacts/${contactId}`;
    const elsewhere = await createSite(owner, workspaceId);
    const outside = await addMember(t, workspaceId, 'support', [elsewhere.id]);

    const refused = await owner
      .post(`${base}/tasks`, { title: 'Gọi', dueAt: at(1), assigneeId: outside.me.user.id })
      .expect(422);
    expect(problemSchema.parse(refused.body).issues?.[0]).toMatchObject({
      path: ['assigneeId'],
      code: 'not_assignable',
    });
    const past = await owner
      .post(`${base}/meetings`, { at: at(-2), place: 'Quận 3', with: '', note: '' })
      .expect(422);
    expect(problemSchema.parse(past.body).issues?.[0]).toMatchObject({ path: ['at'] });
    await owner.post(`${base}/notes`, { text: '   ' }).expect(422);
    await owner.post(`${base}/notes`, { text: 'x'.repeat(2001) }).expect(422);
    await owner
      .patch(`${base}/tasks/${new Types.ObjectId().toHexString()}`, { done: true })
      .expect(404);
    // Nothing failed half way: no records were left.
    expect(
      await db<TaskRecord>('tasks').countDocuments({ contactId: new Types.ObjectId(contactId) }),
    ).toBe(0);
  });

  it('pages the timeline of leads and notes without repeating or skipping an entry', async () => {
    const form = await formSite();
    await send(form, { name: 'Phạm Minh Khoa', phone: '0905 333 444' });
    await send(form, { name: 'Phạm Minh Khoa', phone: '0905 333 444' });
    const contactId = await contactOf(form.site);
    for (let index = 0; index < 23; index += 1) {
      await owner
        .post(`/sites/${form.site.id}/contacts/${contactId}/notes`, { text: `Ghi chú ${index}` })
        .expect(201);
    }
    const first = await timeline(form.site, contactId);
    expect(first.items).toHaveLength(20);
    expect(first.nextCursor).not.toBeNull();
    const second = await timeline(form.site, contactId, first.nextCursor ?? undefined);
    expect(second.items).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    const all: TimelineEntry[] = [...first.items, ...second.items];
    expect(new Set(all.map((item) => item.id)).size).toBe(25);
    const times = all.map((item) => Date.parse(item.at));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(all.slice(-2).map((item) => item.kind)).toEqual(['lead', 'lead']);
  });

  it('moves the records with the profile’s expiry: a lagging one by a note, all by a new retention', async () => {
    const form = await formSite();
    await send(form, { name: 'Đỗ Hải Yến', phone: '0906 444 555' });
    const contactId = await contactOf(form.site);
    const base = `/sites/${form.site.id}/contacts/${contactId}`;
    const contact = new Types.ObjectId(contactId);
    await owner.post(`${base}/notes`, { text: 'Lần một' }).expect(201);
    await owner
      .post(`${base}/tasks`, { title: 'Gọi', dueAt: at(1), assigneeId: ownerId })
      .expect(201);
    // As if written long ago: the next interaction moves them to the profile's expiry.
    const old = new Date(Date.now() + 10 * DAY_MS);
    await db<ContactEventRecord>('contact_events').updateMany(
      { contactId: contact },
      { $set: { expiresAt: old } },
    );
    await db<TaskRecord>('tasks').updateMany({ contactId: contact }, { $set: { expiresAt: old } });
    await owner.post(`${base}/notes`, { text: 'Lần hai' }).expect(201);
    const expiry = (await db<ContactRecord>('contacts').findOne({ _id: contact }))?.expiresAt;
    for (const name of ['contact_events', 'tasks']) {
      const expiries = await db<{ expiresAt: Date | null }>(name)
        .find({ contactId: contact })
        .map((record) => record.expiresAt?.getTime())
        .toArray();
      expect(expiries.length).toBeGreaterThan(0);
      expect(new Set(expiries)).toEqual(new Set([expiry?.getTime()]));
    }

    await savePrivacy(owner, form.site.id, { ...PRIVACY_SETTINGS, retentionMonths: null });
    for (const name of ['contact_events', 'tasks']) {
      expect(
        await db<{ expiresAt: Date | null }>(name).countDocuments({
          contactId: contact,
          expiresAt: { $ne: null },
        }),
      ).toBe(0);
    }
  });

  it('assigns the owner, adds and takes off tags, and edits the details by the form’s rules', async () => {
    const form = await formSite();
    await send(form, { name: 'Vũ Thanh Tâm', phone: '0907 555 666' });
    await send(form, { name: 'Hoàng Lan', phone: '0908 666 777' });
    const contactId = await contactOf(form.site, 'Vũ Thanh Tâm');
    const base = `/sites/${form.site.id}/contacts/${contactId}`;

    const assigned = contactProfileSchema.parse(
      (await owner.patch(base, { action: 'assign', ownerId }).expect(200)).body,
    );
    expect(assigned.owner?.id).toBe(ownerId);
    await owner.patch(base, { action: 'add_tag', tag: 'Niềng răng' }).expect(200);
    const tagged = contactProfileSchema.parse(
      (await owner.patch(base, { action: 'add_tag', tag: 'Trả góp' }).expect(200)).body,
    );
    expect(tagged.tags).toEqual(['Niềng răng', 'Trả góp']);
    const untagged = contactProfileSchema.parse(
      (await owner.patch(base, { action: 'remove_tag', tag: 'Niềng răng' }).expect(200)).body,
    );
    expect(untagged.tags).toEqual(['Trả góp']);

    const edited = contactProfileSchema.parse(
      (
        await owner
          .patch(`${base}/details`, {
            name: 'Vũ Thanh Tâm',
            phone: '0907 555 999',
            email: 'TAM@Mail.vn',
          })
          .expect(200)
      ).body,
    );
    expect(edited).toMatchObject({ phone: '+84907555999', email: 'tam@mail.vn' });
    const search = await owner.post(`/sites/${form.site.id}/contacts/search`, {
      view: 'all',
      q: '0907555999',
    });
    expect(contactListResponseSchema.parse(search.body).items.map((item) => item.id)).toEqual([
      contactId,
    ]);
    // The lead keeps what the person sent.
    const lead = await db<LeadRecord>('leads').findOne({
      contactId: new Types.ObjectId(contactId),
    });
    expect(lead?.fields.phone).toBe('+84907555666');

    const taken = await owner
      .patch(`${base}/details`, { name: 'Vũ Thanh Tâm', phone: '0908 666 777', email: '' })
      .expect(422);
    expect(problemSchema.parse(taken.body).issues?.[0]).toMatchObject({
      path: ['phone'],
      code: 'phone_taken',
      message: 'Số này đã thuộc hồ sơ Hoàng Lan',
    });

    const support = await addMember(t, workspaceId, 'support');
    await support.client.patch(base, { action: 'add_tag', tag: 'VIP' }).expect(200);
    await support.client
      .patch(`${base}/details`, { name: 'Tâm', phone: '0907 555 999', email: '' })
      .expect(403);
    const viewerOnly = await addMember(t, workspaceId, 'editor');
    await viewerOnly.client.get(base).expect(403);
  });

  it('exports the person with their leads and everything the profile holds', async () => {
    const form = await formSite();
    await send(form, { name: 'Bùi Quốc Anh', phone: '0909 777 888', email: 'anh@mail.vn' });
    const contactId = await contactOf(form.site);
    const base = `/sites/${form.site.id}/contacts/${contactId}`;
    await owner.post(`${base}/notes`, { text: 'Hẹn gọi lại' }).expect(201);
    await owner
      .post(`${base}/tasks`, { title: 'Gọi lại', dueAt: at(3), assigneeId: ownerId })
      .expect(201);
    await owner
      .post(`${base}/meetings`, { at: at(30), place: 'Quận 1', with: '', note: '' })
      .expect(201);

    const response = await owner.post(`${base}/export`).expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-disposition']).toMatch(
      /attachment; filename="du-lieu-ca-nhan-/,
    );
    const file = contactExportFileSchema.parse(JSON.parse(response.text));
    expect(file.contact).toMatchObject({ name: 'Bùi Quốc Anh', email: 'anh@mail.vn' });
    expect(file.leads).toHaveLength(1);
    expect(file.leads[0]?.consent).toBeDefined();
    expect(file.notes.map((note) => note.text)).toEqual(['Hẹn gọi lại']);
    expect(file.tasks).toHaveLength(1);
    expect(file.meetings).toHaveLength(1);

    const support = await addMember(t, workspaceId, 'support');
    await support.client.post(`${base}/export`).expect(403);
  });

  it('deletes the person with every lead, note, task and meeting, completing a request when picked', async () => {
    const form = await formSite();
    await send(form, { name: 'Lý Gia Hân', phone: '0911 888 999', email: 'han@mail.vn' });
    await send(form, { name: 'Lý Gia Hân', phone: '0911 888 999' });
    const contactId = await contactOf(form.site);
    const base = `/sites/${form.site.id}/contacts/${contactId}`;
    await owner.post(`${base}/notes`, { text: 'Ghi chú' }).expect(201);
    await owner
      .post(`${base}/tasks`, { title: 'Gọi', dueAt: at(2), assigneeId: ownerId })
      .expect(201);
    await owner
      .post(`${base}/meetings`, { at: at(5), place: 'Quận 5', with: '', note: '' })
      .expect(201);
    const created = await owner
      .post(`/sites/${form.site.id}/data-requests`, {
        name: 'Lý Gia Hân',
        phone: '0911 888 999',
        email: '',
        type: 'delete',
        receivedAt: new Date(Date.now() - HOUR_MS).toISOString(),
      })
      .expect(201);
    const requestId = dataRequestDetailSchema.parse(created.body).id;

    const support = await addMember(t, workspaceId, 'support');
    await support.client.get(`${base}/deletion`).expect(403);
    await support.client.post(`${base}/delete`, { requestId: null }).expect(403);

    const preview = contactDeletionPreviewSchema.parse(
      (await owner.get(`${base}/deletion`).expect(200)).body,
    );
    expect(preview).toMatchObject({ leads: 2, notes: 1, tasks: 1, meetings: 1 });
    expect(preview.requests.map((request) => request.id)).toEqual([requestId]);

    const deleted = deleteContactPersonResponseSchema.parse(
      (await owner.post(`${base}/delete`, { requestId }).expect(200)).body,
    );
    expect(deleted.deletedLeads).toBe(2);
    const contact = new Types.ObjectId(contactId);
    const siteId = new Types.ObjectId(form.site.id);
    expect(await db<ContactRecord>('contacts').countDocuments({ _id: contact })).toBe(0);
    expect(await db<LeadRecord>('leads').countDocuments({ siteId })).toBe(0);
    for (const name of ['contact_events', 'tasks', 'meetings']) {
      expect(await db(name).countDocuments({ siteId })).toBe(0);
    }
    const request = dataRequestDetailSchema.parse(
      (await owner.get(`/sites/${form.site.id}/data-requests/${requestId}`).expect(200)).body,
    );
    expect(request.status).toBe('completed');
    await owner.get(base).expect(404);
  });

  it('deletes without a request, refuses one that is not a deletion, and merges records into the kept profile', async () => {
    const form = await formSite();
    await send(form, { name: 'Tạ Minh', phone: '0912 000 111', email: 'minh@mail.vn' });
    await send(form, { name: 'Tạ Minh', phone: '0912 000 222', email: 'minh@mail.vn' });
    const pairs = mergeSuggestionListResponseSchema.parse(
      (await owner.get(`/sites/${form.site.id}/contact-suggestions`).expect(200)).body,
    );
    const pair = pairs.items[0];
    if (!pair) {
      throw new Error('No pair suggested');
    }
    await owner
      .post(`/sites/${form.site.id}/contacts/${pair.b.id}/notes`, { text: 'Trên hồ sơ mới' })
      .expect(201);
    await owner
      .post(`/sites/${form.site.id}/contact-suggestions/${pair.id}/merge`, {
        picks: { name: 'a', phone: 'a', email: 'a', owner: 'a', marketing: 'a' },
      })
      .expect(200);
    const merged = await timeline(form.site, pair.a.id);
    expect(merged.items.filter((item) => item.kind === 'note')).toHaveLength(1);
    expect(merged.items.filter((item) => item.kind === 'lead')).toHaveLength(2);

    const access = await owner
      .post(`/sites/${form.site.id}/data-requests`, {
        name: 'Tạ Minh',
        phone: '0912 000 111',
        email: '',
        type: 'access',
        receivedAt: new Date(Date.now() - HOUR_MS).toISOString(),
      })
      .expect(201);
    await owner
      .post(`/sites/${form.site.id}/contacts/${pair.a.id}/delete`, {
        requestId: dataRequestDetailSchema.parse(access.body).id,
      })
      .expect(409);
    const deleted = deleteContactPersonResponseSchema.parse(
      (
        await owner
          .post(`/sites/${form.site.id}/contacts/${pair.a.id}/delete`, { requestId: null })
          .expect(200)
      ).body,
    );
    expect(deleted.deletedLeads).toBe(2);
    expect(
      await db<MeetingRecord>('contact_events').countDocuments({
        siteId: new Types.ObjectId(form.site.id),
      }),
    ).toBe(0);
  });

  it('keeps a profile inside its site and workspace', async () => {
    const form = await formSite();
    await send(form, { name: 'Khách riêng', phone: '0913 111 999' });
    const contactId = await contactOf(form.site);
    const stranger = await signedUpClient(t.app);
    await stranger.client.get(`/sites/${form.site.id}/contacts/${contactId}`).expect(404);
    await stranger.client
      .post(`/sites/${form.site.id}/contacts/${contactId}/notes`, { text: 'x' })
      .expect(404);
    const other = await createSite(owner, workspaceId);
    await owner.get(`/sites/${other.id}/contacts/${contactId}`).expect(404);
    await owner.post(`/sites/${other.id}/contacts/${contactId}/notes`, { text: 'x' }).expect(404);
    await owner.get(`/sites/${form.site.id}/contacts/not-an-id`).expect(404);
    const narrow = await addMember(t, workspaceId, 'support', [other.id]);
    await narrow.client.get(`/sites/${form.site.id}/contacts/${contactId}`).expect(404);
    // The list's fixed routes still answer as before.
    await owner.get(`/sites/${form.site.id}/contacts/options`).expect(200);
    expect(
      createContactResponseSchema.parse(
        (
          await owner
            .post(`/sites/${form.site.id}/contacts`, {
              name: 'Khách gọi',
              phone: '0913 111 999',
              channel: 'phone_call',
              marketing: false,
            })
            .expect(200)
        ).body,
      ).status,
    ).toBe('exists');
  });
});
