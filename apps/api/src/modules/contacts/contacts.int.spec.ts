import {
  type ContactListResponse,
  contactListResponseSchema,
  contactOptionsResponseSchema,
  createContactResponseSchema,
  type MergeSuggestionListResponse,
  mergeContactsResponseSchema,
  mergeSuggestionListResponseSchema,
  problemSchema,
  type PublicLeadRequest,
  type Site,
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
import { configurePrivacy, PRIVACY_SETTINGS, savePrivacy } from '../../../test/privacy.js';
import { addConfirmedRecipient } from '../../../test/recipients.js';
import { addMember, createSite } from '../../../test/resources.js';
import { addMonthsUtc } from '../leads/domain/lead-intake-rules.js';
import type { LeadRecord } from '../leads/lead.schema.js';
import type { ContactRecord } from './contact.schema.js';
import { ContactsBackfill } from './contacts-backfill.service.js';

const DAY_MS = 86_400_000;

/** Customers (board 22, ADR-033): gathered from leads, listed, added by hand, merged. */
describe('contacts', () => {
  let t: TestApp;
  let owner: TestClient;
  let ownerId: string;
  let workspaceId: string;

  beforeAll(async () => {
    t = await createTestApp('plp_test_contacts', {
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

  async function list(
    site: Site,
    body: Record<string, unknown> = {},
    client = owner,
  ): Promise<ContactListResponse> {
    const { q, ...query } = body;
    const response =
      q === undefined
        ? await client
            .get(
              `/sites/${site.id}/contacts?${new URLSearchParams(query as Record<string, string>).toString()}`,
            )
            .expect(200)
        : await client.post(`/sites/${site.id}/contacts/search`, body).expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    return contactListResponseSchema.parse(response.body);
  }

  async function suggestions(site: Site): Promise<MergeSuggestionListResponse> {
    const response = await owner.get(`/sites/${site.id}/contact-suggestions`).expect(200);
    return mergeSuggestionListResponseSchema.parse(response.body);
  }

  function contactsDb() {
    return t.workspaceDb(workspaceId).collection<ContactRecord>('contacts');
  }

  function idOf(page: ContactListResponse, name: string): string {
    const item = page.items.find((contact) => contact.name === name);
    if (!item) {
      throw new Error(`No contact named ${name}`);
    }
    return item.id;
  }

  it('gathers a person’s leads into one profile by phone number, never suspected spam', async () => {
    const form = await formSite();
    await send(form, {
      name: 'Nguyễn Thu Trang',
      phone: '0912 345 678',
      source: { utmSource: 'facebook', utmMedium: 'cpc', utmCampaign: null, referrer: null },
    });
    await send(form, { name: 'Trang', phone: '+84 912 345 678', email: 'trang@mail.vn' });
    await send(form, { name: 'Bot', phone: '0938 000 111', honeypot: 'https://spam.example' });

    const page = await list(form.site);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      name: 'Nguyễn Thu Trang',
      phone: '+84912345678',
      // A later lead fills the empty email, never renames the profile.
      email: 'trang@mail.vn',
      leadCount: 2,
      owner: null,
      source: { kind: 'lead', page: { id: form.pageId, title: 'Đăng ký tư vấn' } },
      possibleDuplicate: false,
    });
    expect(page.counts.all).toEqual({ count: 1, capped: false });
    expect(page.counts.unassigned).toEqual({ count: 1, capped: false });

    const leads = await t
      .workspaceDb(workspaceId)
      .collection<LeadRecord>('leads')
      .find({ siteId: new Types.ObjectId(form.site.id) })
      .toArray();
    const spam = leads.find((lead) => lead.spam.suspected);
    expect(spam?.contactId).toBeNull();
    expect(
      leads.filter((lead) => lead['contactId'] !== null).map((lead) => String(lead['contactId'])),
    ).toEqual([page.items[0]?.id, page.items[0]?.id]);

    // "Không phải spam": the lead joins a profile of its own then.
    await owner
      .patch(`/sites/${form.site.id}/leads/${String(spam?.['_id'])}`, { spam: false })
      .expect(200);
    expect((await list(form.site)).items.map((contact) => contact.name)).toEqual([
      'Bot',
      'Nguyễn Thu Trang',
    ]);
  });

  it('expires a profile with the retention after its last lead, and follows a new period', async () => {
    const form = await formSite();
    await send(form, { name: 'Lê Hoàng Nam', phone: '0938 222 104' });
    const [stored] = await contactsDb()
      .find({ siteId: new Types.ObjectId(form.site.id) })
      .toArray();
    const months = PRIVACY_SETTINGS.retentionMonths;
    if (!stored || months === null) {
      throw new Error('Expected a profile and a retention period');
    }
    expect(stored.expiresAt).toEqual(addMonthsUtc(stored.lastActivityAt, months));

    await savePrivacy(owner, form.site.id, { ...PRIVACY_SETTINGS, retentionMonths: null });
    const kept = await contactsDb().findOne({ _id: stored._id });
    expect(kept?.['expiresAt']).toBeNull();
  });

  it('lists the views, filters by owner and tag, and searches from the body', async () => {
    const form = await formSite();
    await send(form, { name: 'Phạm Mỹ Duyên', phone: '0977 645 010' });
    await send(form, { name: 'Trần Quốc Việt', phone: '0903 118 902' });
    await send(form, { name: 'Võ Ngọc Hân', phone: '0868 300 471', email: 'han@mail.vn' });
    const first = await list(form.site);
    // The most recent interaction first.
    expect(first.items.map((contact) => contact.name)).toEqual([
      'Võ Ngọc Hân',
      'Trần Quốc Việt',
      'Phạm Mỹ Duyên',
    ]);

    await owner
      .post(`/sites/${form.site.id}/contacts/bulk`, {
        action: 'assign',
        contactIds: [idOf(first, 'Võ Ngọc Hân'), idOf(first, 'Trần Quốc Việt')],
        ownerId,
      })
      .expect(200, { updated: 2 });
    await owner
      .post(`/sites/${form.site.id}/contacts/bulk`, {
        action: 'tag',
        contactIds: [idOf(first, 'Võ Ngọc Hân')],
        tag: 'Implant',
      })
      .expect(200, { updated: 1 });

    const mine = await list(form.site, { view: 'mine' });
    expect(mine.items.map((contact) => contact.name)).toEqual(['Võ Ngọc Hân', 'Trần Quốc Việt']);
    expect(mine.items[0]?.owner?.id).toBe(ownerId);
    expect(mine.counts).toMatchObject({
      all: { count: 3 },
      mine: { count: 2 },
      unassigned: { count: 1 },
      duplicates: { count: 0 },
    });
    expect((await list(form.site, { view: 'unassigned' })).items[0]?.name).toBe('Phạm Mỹ Duyên');
    expect((await list(form.site, { ownerId })).items).toHaveLength(2);
    const tagged = await list(form.site, { tag: 'Implant' });
    expect(tagged.items.map((contact) => contact.name)).toEqual(['Võ Ngọc Hân']);
    expect(tagged.counts.all.count).toBe(1);

    expect((await list(form.site, { q: '0903 1' })).items[0]?.name).toBe('Trần Quốc Việt');
    expect((await list(form.site, { q: 'han@' })).items[0]?.name).toBe('Võ Ngọc Hân');
    expect((await list(form.site, { q: 'my duyen' })).items[0]?.name).toBe('Phạm Mỹ Duyên');

    const options = contactOptionsResponseSchema.parse(
      (await owner.get(`/sites/${form.site.id}/contacts/options`).expect(200)).body,
    );
    expect(options.tags).toEqual(['Implant']);
    expect(options.assignees.map((person) => person.id)).toContain(ownerId);
  });

  it('pages 25 profiles at a time with a cursor', async () => {
    const form = await formSite();
    const now = Date.now();
    await t
      .workspaceDb(workspaceId)
      .collection('contacts')
      .insertMany(
        Array.from({ length: 27 }, (_, index) => ({
          workspaceId: new Types.ObjectId(workspaceId),
          siteId: new Types.ObjectId(form.site.id),
          name: `Khách ${String(index).padStart(2, '0')}`,
          phone: `+849000000${String(index).padStart(2, '0')}`,
          email: null,
          search: { phone: null, email: null, name: `khach ${index}` },
          ownerId: null,
          tags: [],
          origin: {
            kind: 'manual',
            channel: 'walk_in',
            addedBy: new Types.ObjectId(ownerId),
            at: new Date(now),
          },
          marketing: { consented: false, at: null, recordedBy: null },
          leadCount: 0,
          lastLead: null,
          lastActivityAt: new Date(now - index * 60_000),
          createdAt: new Date(now),
          expiresAt: null,
        })),
      );
    const first = await list(form.site);
    expect(first.items).toHaveLength(25);
    expect(first.items[0]?.name).toBe('Khách 00');
    expect(first.nextCursor).not.toBeNull();
    const second = await list(form.site, { cursor: first.nextCursor });
    expect(second.items.map((contact) => contact.name)).toEqual(['Khách 25', 'Khách 26']);
    expect(second.nextCursor).toBeNull();
  });

  it('adds a profile by hand with its source, and points to the profile that has the number', async () => {
    const form = await formSite();
    const created = createContactResponseSchema.parse(
      (
        await owner
          .post(`/sites/${form.site.id}/contacts`, {
            name: 'Bùi Thanh Hương',
            phone: '0915 007 266',
            channel: 'phone_call',
            marketing: true,
          })
          .expect(200)
      ).body,
    );
    if (created.status !== 'created') {
      throw new Error('Expected a new profile');
    }
    expect(created.contact).toMatchObject({
      name: 'Bùi Thanh Hương',
      phone: '+84915007266',
      leadCount: 0,
      source: { kind: 'manual', channel: 'phone_call' },
    });
    const stored = await contactsDb().findOne({ _id: new Types.ObjectId(created.contact.id) });
    expect(stored?.origin).toMatchObject({ kind: 'manual', channel: 'phone_call' });
    expect(stored?.origin.kind === 'manual' ? String(stored.origin.addedBy) : null).toBe(ownerId);
    expect(String(stored?.marketing.recordedBy)).toBe(ownerId);

    const again = await owner
      .post(`/sites/${form.site.id}/contacts`, {
        name: 'Hương',
        phone: '+84 915 007 266',
        channel: 'walk_in',
      })
      .expect(200);
    expect(createContactResponseSchema.parse(again.body)).toEqual({
      status: 'exists',
      contact: { id: created.contact.id, name: 'Bùi Thanh Hương' },
    });

    // A lead with that number joins the profile added by hand.
    await send(form, { name: 'Thanh Hương', phone: '0915 007 266' });
    expect((await list(form.site)).items[0]).toMatchObject({
      id: created.contact.id,
      leadCount: 1,
      source: { kind: 'manual' },
    });

    const missing = await owner
      .post(`/sites/${form.site.id}/contacts`, { name: 'Ai đó', phone: '0901 000 000' })
      .expect(422);
    expect(problemSchema.parse(missing.body).status).toBe(422);
  });

  it('refuses an owner who cannot see the site, and a tag beyond the limits', async () => {
    const form = await formSite();
    await send(form, { name: 'Đặng Minh Tú', phone: '0789 554 321' });
    const [contact] = (await list(form.site)).items;
    const otherSite = await createSite(owner, workspaceId);
    const outside = await addMember(t, workspaceId, 'support', [otherSite.id]);
    const refused = await owner
      .post(`/sites/${form.site.id}/contacts/bulk`, {
        action: 'assign',
        contactIds: [contact?.id],
        ownerId: outside.me.user.id,
      })
      .expect(422);
    expect(problemSchema.parse(refused.body).issues?.[0]?.code).toBe('not_assignable');

    await owner
      .post(`/sites/${form.site.id}/contacts/bulk`, {
        action: 'tag',
        contactIds: [contact?.id],
        tag: 'x'.repeat(31),
      })
      .expect(422);

    const siteId = new Types.ObjectId(form.site.id);
    await contactsDb().updateOne(
      { _id: new Types.ObjectId(contact?.id) },
      { $set: { tags: Array.from({ length: 20 }, (_, index) => `Nhãn ${index}`) } },
    );
    // Full: the profile keeps its 20 tags.
    await owner
      .post(`/sites/${form.site.id}/contacts/bulk`, {
        action: 'tag',
        contactIds: [contact?.id],
        tag: 'Nhãn mới',
      })
      .expect(200, { updated: 0 });
    await contactsDb().insertOne({
      _id: new Types.ObjectId(),
      workspaceId: new Types.ObjectId(workspaceId),
      siteId,
      name: 'Nhiều nhãn',
      phone: null,
      email: null,
      search: { phone: null, email: null, name: 'nhieu nhan' },
      ownerId: null,
      tags: Array.from({ length: 80 }, (_, index) => `Khác ${index}`),
      origin: { kind: 'lead' },
      marketing: { consented: false, at: null, recordedBy: null },
      leadCount: 0,
      lastLead: null,
      lastActivityAt: new Date(),
      createdAt: new Date(),
      expiresAt: null,
    });
    const tooMany = await owner
      .post(`/sites/${form.site.id}/contacts/bulk`, {
        action: 'tag',
        contactIds: [contact?.id],
        tag: 'Thứ 101',
      })
      .expect(422);
    expect(problemSchema.parse(tooMany.body).issues?.[0]?.code).toBe('too_many_tags');
  });

  it('suggests two profiles with one email, merges them into the older one, moving its leads', async () => {
    const form = await formSite();
    await send(form, { name: 'Nguyễn Thu Trang', phone: '0912 345 001', email: 'tr@mail.vn' });
    await send(form, { name: 'Thu Trang', phone: '0988 777 001', email: 'tr@mail.vn' });
    const pairs = await suggestions(form.site);
    expect(pairs.total.count).toBe(1);
    const [pair] = pairs.items;
    if (!pair) {
      throw new Error('Expected a pair');
    }
    expect(pair.reason).toEqual({ kind: 'email' });
    expect(pair.a.name).toBe('Nguyễn Thu Trang');
    expect(pair.b.name).toBe('Thu Trang');
    const listed = await list(form.site);
    expect(listed.items.every((contact) => contact.possibleDuplicate)).toBe(true);
    expect(listed.counts.duplicates.count).toBe(1);

    const merged = mergeContactsResponseSchema.parse(
      (
        await owner
          .post(`/sites/${form.site.id}/contact-suggestions/${pair.id}/merge`, {
            picks: { name: 'b', phone: 'a', email: 'a', owner: 'a', marketing: 'a' },
          })
          .expect(200)
      ).body,
    );
    expect(merged.contact).toMatchObject({
      id: pair.a.id,
      name: 'Thu Trang',
      phone: '+84912345001',
      leadCount: 2,
    });
    const after = await list(form.site);
    expect(after.items.map((contact) => contact.id)).toEqual([pair.a.id]);
    expect(after.counts.duplicates.count).toBe(0);
    const leads = await t
      .workspaceDb(workspaceId)
      .collection<LeadRecord>('leads')
      .find({ siteId: new Types.ObjectId(form.site.id) })
      .toArray();
    expect(leads.map((lead) => String(lead['contactId']))).toEqual([pair.a.id, pair.a.id]);
    // The pair is gone with the profile merged away.
    await owner
      .post(`/sites/${form.site.id}/contact-suggestions/${pair.id}/merge`, {
        picks: { name: 'a', phone: 'a', email: 'a', owner: 'a', marketing: 'a' },
      })
      .expect(404);
  });

  it('suggests one name on one page within 7 days, and never again once dismissed', async () => {
    const form = await formSite();
    await send(form, { name: 'Lê Thị Mai', phone: '0901 111 001' });
    await send(form, { name: 'Le Thi Mai', phone: '0901 111 002' });
    const pairs = await suggestions(form.site);
    expect(pairs.items).toHaveLength(1);
    const [pair] = pairs.items;
    expect(pair?.reason).toEqual({
      kind: 'name_page',
      page: { id: form.pageId, title: 'Đăng ký tư vấn' },
      days: 0,
    });

    await owner.post(`/sites/${form.site.id}/contact-suggestions/${pair?.id}/dismiss`).expect(204);
    expect((await suggestions(form.site)).items).toHaveLength(0);
    // Another lead of either person does not bring the pair back.
    await send(form, { name: 'Lê Thị Mai', phone: '0901 111 002' });
    expect((await suggestions(form.site)).items).toHaveLength(0);
  });

  it('builds profiles for leads stored before they existed, once', async () => {
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
        phone: '+84913000001',
        createdAt: new Date(Date.now() - 3 * DAY_MS),
      }),
      storedLead({
        ...base,
        name: 'Lâm',
        phone: '+84913000001',
        marketing: true,
        createdAt: new Date(Date.now() - DAY_MS),
      }),
      storedLead({ ...base, name: 'Spam', phone: '+84913000002', spam: true }),
    ]);
    const backfill = t.app.get(ContactsBackfill);
    const ref = { workspaceId: new Types.ObjectId(workspaceId) };
    expect(await backfill.runWorkspace(ref, new Date())).toBe(2);
    expect(await backfill.runWorkspace(ref, new Date())).toBe(0);
    const [contact] = (await list(form.site)).items;
    expect(contact).toMatchObject({ name: 'Hồ Văn Lâm', leadCount: 2 });
    const stored = await contactsDb().findOne({ _id: new Types.ObjectId(contact?.id) });
    expect(stored?.['marketing'].consented).toBe(true);
  });

  it('deletes a person’s profile with their leads, and a site’s profiles with the site', async () => {
    const form = await formSite();
    await send(form, { name: 'Ngô Bảo Châu', phone: '0933 444 555' });
    const lead = await t
      .workspaceDb(workspaceId)
      .collection<LeadRecord>('leads')
      .findOne({ siteId: new Types.ObjectId(form.site.id) });
    await owner.delete(`/sites/${form.site.id}/leads/${String(lead?._id)}/person`).expect(200);
    expect(await contactsDb().countDocuments({ siteId: new Types.ObjectId(form.site.id) })).toBe(0);

    await send(form, { name: 'Ngô Bảo Châu', phone: '0933 444 555' });
    await owner.delete(`/sites/${form.site.id}`).send({ confirmName: form.site.name }).expect(204);
    expect(await contactsDb().countDocuments({ siteId: new Types.ObjectId(form.site.id) })).toBe(0);
  });

  it('keeps profiles inside their workspace and the sites a member may open', async () => {
    const form = await formSite();
    await send(form, { name: 'Khách riêng', phone: '0944 555 666' });
    const stranger = await signedUpClient(t.app);
    await stranger.client.get(`/sites/${form.site.id}/contacts`).expect(404);
    await stranger.client.get(`/sites/${form.site.id}/contact-suggestions`).expect(404);
    const elsewhere = await createSite(owner, workspaceId);
    const narrow = await addMember(t, workspaceId, 'support', [elsewhere.id]);
    await narrow.client.get(`/sites/${form.site.id}/contacts`).expect(404);
    const editor = await addMember(t, workspaceId, 'editor');
    await editor.client.get(`/sites/${form.site.id}/contacts`).expect(403);
    // A search in the URL is refused: it belongs in the body.
    await owner.get(`/sites/${form.site.id}/contacts?q=0944`).expect(422);
  });
});
