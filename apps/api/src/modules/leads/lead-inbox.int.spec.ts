import {
  addVnDays,
  type LeadDetail,
  leadCountsSchema,
  leadDetailSchema,
  type LeadListResponse,
  leadListResponseSchema,
  pageRefListResponseSchema,
  problemSchema,
  type PublicLeadRequest,
  type Site,
  vnDayOf,
} from '@plp/contracts';
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
  createPage,
  listPages,
  publish,
  RecordingRevalidationClient,
  replaceDraft,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../../test/pages.js';
import { configurePrivacy, PRIVACY_SETTINGS, saveConsentVersion } from '../../../test/privacy.js';
import { addEditor, createSite } from '../../../test/resources.js';

const DAY_MS = 86_400_000;

/** The lead inbox (board 10, ADR-018): list, filters, search, counts, detail and triage. */
describe('lead inbox', () => {
  let t: TestApp;
  let owner: TestClient;
  let workspaceId: string;

  beforeAll(async () => {
    t = await createTestApp('plp_test_lead_inbox', {
      ...withRevalidationRecorder(new RecordingRevalidationClient()),
      env: { LEAD_LIMIT_PER_CLIENT: 1000, LEAD_LIMIT_PER_SITE_PER_HOUR: 1000 },
    });
    const signedUp = await signedUpClient(t.app);
    owner = signedUp.client;
    workspaceId = signedUp.workspaceId;
  });

  afterAll(async () => {
    await t.close();
  });

  interface FormPage {
    pageId: string;
    releaseId: string;
  }

  /** A live page with a form asking every field, on a site with consent settings. */
  async function formPage(site: Site, title = 'Đăng ký tư vấn'): Promise<FormPage> {
    const slug = uniqueSlug('tu-van');
    const page = await createPage(owner, site.id, { title, slug });
    await replaceDraft(
      owner,
      page.page.id,
      formDraft(slug, leadFormSection({ showEmail: true, showMessage: true })),
    );
    const published = await publish(owner, page.page.id);
    return { pageId: page.page.id, releaseId: published.release.id };
  }

  async function inboxSite(): Promise<{ site: Site } & FormPage> {
    const site = await createSite(owner, workspaceId);
    await configurePrivacy(owner, site.id);
    return { site, ...(await formPage(site)) };
  }

  async function send(
    site: Site,
    releaseId: string,
    overrides: Partial<PublicLeadRequest> = {},
  ): Promise<void> {
    await submitLead(t, site.subdomain, leadBody(releaseId, overrides)).expect(201);
  }

  async function inbox(site: Site, query = '', client = owner): Promise<LeadListResponse> {
    const response = await client.get(`/sites/${site.id}/leads${query}`).expect(200);
    return leadListResponseSchema.parse(response.body);
  }

  function names(list: LeadListResponse): string[] {
    return list.items.map((item) => item.name);
  }

  async function detail(leadId: string, client = owner): Promise<LeadDetail> {
    const response = await client.get(`/leads/${leadId}`).expect(200);
    return leadDetailSchema.parse(response.body);
  }

  function leadIdOf(list: LeadListResponse, name: string): string {
    const item = list.items.find((lead) => lead.name === name);
    if (!item) {
      throw new Error(`No lead named ${name}`);
    }
    return item.id;
  }

  it('lists the inbox of the last 7 days, newest first, and counts each folder', async () => {
    const { site, pageId, releaseId } = await inboxSite();
    await send(site, releaseId, {
      name: 'Nguyễn Thu Hà',
      source: { utmSource: 'facebook', utmMedium: 'cpc', utmCampaign: null, referrer: null },
    });
    await send(site, releaseId, { name: 'Trần Quốc Bảo', phone: '0938 512 840' });
    await send(site, releaseId, { name: 'Bot', honeypot: 'https://spam.example' });
    const tenDaysAgo = new Date(Date.now() - 10 * DAY_MS);
    await insertLeads(t, [
      storedLead({
        workspaceId,
        siteId: site.id,
        pageId,
        releaseId,
        name: 'Lê Mai Anh',
        createdAt: tenDaysAgo,
      }),
    ]);

    const response = await owner.get(`/sites/${site.id}/leads`).expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const list = leadListResponseSchema.parse(response.body);
    expect(names(list)).toEqual(['Trần Quốc Bảo', 'Nguyễn Thu Hà']);
    expect(list.items[1]).toMatchObject({
      phone: '+84901234567',
      page: { id: pageId, title: 'Đăng ký tư vấn' },
      source: { source: 'facebook', medium: 'cpc', campaign: null },
      status: 'new',
    });
    expect(list.counts).toEqual({
      inbox: { count: 2, capped: false },
      spam: { count: 1, capped: false },
    });
    expect(list.nextCursor).toBeNull();

    expect(names(await inbox(site, '?folder=spam'))).toEqual(['Bot']);
    expect(names(await inbox(site, '?range=all'))).toEqual([
      'Trần Quốc Bảo',
      'Nguyễn Thu Hà',
      'Lê Mai Anh',
    ]);
    const day = vnDayOf(tenDaysAgo);
    expect(names(await inbox(site, `?range=custom&from=${day}&to=${day}`))).toEqual(['Lê Mai Anh']);
    expect(
      names(await inbox(site, `?range=custom&from=${addVnDays(day, 1)}&to=${addVnDays(day, 2)}`)),
    ).toEqual([]);
  });

  it('filters by page and status, and searches phone numbers, emails and names', async () => {
    const { site, releaseId } = await inboxSite();
    const other = await formPage(site, 'Cấy ghép Implant');
    await send(site, releaseId, {
      name: 'Nguyễn Thu Hà',
      phone: '0901 234 567',
      email: 'ThuHa@Example.com',
    });
    await send(site, other.releaseId, { name: 'Trần Quốc Bảo', phone: '0938 512 840' });
    await send(site, releaseId, { name: 'Lê Mai Anh', phone: '+84 987 106 223' });
    const all = await inbox(site);
    await owner.patch(`/leads/${leadIdOf(all, 'Lê Mai Anh')}`, { status: 'contacted' }).expect(200);

    expect(names(await inbox(site, `?pageId=${other.pageId}`))).toEqual(['Trần Quốc Bảo']);
    expect(names(await inbox(site, '?status=contacted'))).toEqual(['Lê Mai Anh']);
    expect(names(await inbox(site, '?status=new'))).toEqual(['Trần Quốc Bảo', 'Nguyễn Thu Hà']);

    const byPhone = await inbox(site, '?q=0938%20512');
    expect(names(byPhone)).toEqual(['Trần Quốc Bảo']);
    expect(byPhone.counts.inbox).toEqual({ count: 1, capped: false });
    expect(names(await inbox(site, `?q=${encodeURIComponent('+84 987')}`))).toEqual(['Lê Mai Anh']);
    expect(names(await inbox(site, '?q=901%20234'))).toEqual(['Nguyễn Thu Hà']);
    expect(names(await inbox(site, '?q=thuha%40ex'))).toEqual(['Nguyễn Thu Hà']);
    expect(names(await inbox(site, '?q=quoc%20bao'))).toEqual(['Trần Quốc Bảo']);
    expect(names(await inbox(site, `?q=${encodeURIComponent('Bảo')}`))).toEqual(['Trần Quốc Bảo']);
    // A phone number is matched from its start only.
    expect(names(await inbox(site, '?q=567'))).toEqual([]);
    // Characters that mean something in a regular expression are searched literally.
    expect(names(await inbox(site, `?q=${encodeURIComponent('.*')}`))).toEqual([]);
  });

  it('refuses filters the inbox does not know', async () => {
    const { site } = await inboxSite();
    for (const query of [
      '?folder=trash',
      '?status=lost',
      '?range=custom&from=2026-10-01',
      '?range=custom&from=2025-01-01&to=2026-12-31',
      `?q=${'x'.repeat(81)}`,
      '?pageId=abc',
      '?cursor=nope',
    ]) {
      const response = await owner.get(`/sites/${site.id}/leads${query}`).expect(422);
      expect(problemSchema.parse(response.body).code).toBe('validation_failed');
    }
  });

  it('pages through the leads with a cursor, without repeats', async () => {
    const { site, pageId, releaseId } = await inboxSite();
    const start = Date.now() - 60_000;
    await insertLeads(
      t,
      ['An', 'Bình', 'Chi', 'Dũng', 'Giang'].map((name, index) =>
        storedLead({
          workspaceId,
          siteId: site.id,
          pageId,
          releaseId,
          name,
          // The same instant for two of them: the id breaks the tie.
          createdAt: new Date(start + Math.min(index, 3) * 1000),
        }),
      ),
    );
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const query: string = cursor === null ? '?limit=2' : `?limit=2&cursor=${cursor}`;
      const page = await inbox(site, query);
      expect(page.items.length).toBeLessThanOrEqual(2);
      seen.push(...names(page));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor !== null);
    expect(pages).toBe(3);
    expect(seen).toHaveLength(5);
    expect(seen.slice(2)).toEqual(['Chi', 'Bình', 'An']);
    expect(new Set(seen).size).toBe(5);
  });

  it('counts new leads of all time and leads of the last 7 days, spam excluded, up to 999', async () => {
    const { site, pageId, releaseId } = await inboxSite();
    await send(site, releaseId, { name: 'Nguyễn Thu Hà' });
    await send(site, releaseId, { name: 'Trần Quốc Bảo' });
    await send(site, releaseId, { name: 'Bot', honeypot: 'x' });
    const old = { workspaceId, siteId: site.id, pageId, releaseId };
    await insertLeads(t, [
      storedLead({ ...old, name: 'Cũ', createdAt: new Date(Date.now() - 20 * DAY_MS) }),
    ]);
    await owner
      .patch(`/leads/${leadIdOf(await inbox(site), 'Trần Quốc Bảo')}`, { status: 'scheduled' })
      .expect(200);

    const response = await owner.get(`/sites/${site.id}/lead-counts`).expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(leadCountsSchema.parse(response.body)).toEqual({
      new: { count: 2, capped: false },
      last7Days: { count: 2, capped: false },
    });

    await insertLeads(
      t,
      Array.from({ length: 1000 }, (_, index) => storedLead({ ...old, name: `Lead ${index}` })),
    );
    const capped = leadCountsSchema.parse(
      (await owner.get(`/sites/${site.id}/lead-counts`).expect(200)).body,
    );
    expect(capped).toEqual({
      new: { count: 999, capped: true },
      last7Days: { count: 999, capped: true },
    });
    expect((await inbox(site)).counts.inbox).toEqual({ count: 999, capped: true });
  });

  it('shows a lead with the consent text of the release the visitor saw, and their other leads', async () => {
    const { site, pageId, releaseId } = await inboxSite();
    await send(site, releaseId, {
      name: 'Nguyễn Thu Hà',
      email: 'thuha@example.com',
      message: 'Gọi sau 18h',
      marketing: true,
    });
    await send(site, releaseId, {
      name: 'Thu Hà',
      phone: '0912 000 111',
      email: 'thuha@example.com',
    });
    await send(site, releaseId, { name: 'Trần Quốc Bảo', phone: '0938 512 840' });
    const first = leadIdOf(await inbox(site), 'Nguyễn Thu Hà');

    const lead = await detail(first);
    expect(lead).toMatchObject({
      name: 'Nguyễn Thu Hà',
      phone: '+84901234567',
      email: 'thuha@example.com',
      message: 'Gọi sau 18h',
      page: { id: pageId, title: 'Đăng ký tư vấn' },
      releaseVersion: 1,
      device: 'desktop',
      status: 'new',
      note: '',
      spam: { suspected: false, reasons: [] },
      consent: {
        version: 1,
        controllerName: PRIVACY_SETTINGS.controllerName,
        policyUrl: PRIVACY_SETTINGS.policyUrl,
        requiredText: `Tôi đồng ý để ${PRIVACY_SETTINGS.controllerName} xử lý họ tên và số điện thoại của tôi nhằm liên hệ tư vấn dịch vụ.`,
        marketingText: 'Nhận thông tin ưu đãi qua Zalo hoặc SMS (không bắt buộc)',
        marketing: true,
        marketingWithdrawnAt: null,
      },
      // The same email links the second lead to the same person.
      personLeads: { count: 2, capped: false },
    });
    const expires = new Date(lead.createdAt);
    expires.setUTCMonth(expires.getUTCMonth() + 12);
    expect(lead.expiresAt).toBe(expires.toISOString());

    // A new consent text, published again: older leads keep the text their visitor agreed to.
    await saveConsentVersion(owner, site.id, 1, { requiredText: 'Bản 2 của {Tên doanh nghiệp}.' });
    const republished = await publish(owner, pageId);
    await send(site, republished.release.id, { name: 'Võ Ngọc Trâm', phone: '0703 285 664' });
    const newer = await detail(leadIdOf(await inbox(site), 'Võ Ngọc Trâm'));
    expect(newer.consent).toMatchObject({
      version: 2,
      requiredText: `Bản 2 của ${PRIVACY_SETTINGS.controllerName}.`,
    });
    expect(newer.releaseVersion).toBe(2);
    expect((await detail(first)).consent).toMatchObject({ version: 1 });
  });

  it('changes status, note and spam for owners and editors alike', async () => {
    const { site, releaseId } = await inboxSite();
    await send(site, releaseId, { name: 'Nguyễn Thu Hà' });
    const leadId = leadIdOf(await inbox(site), 'Nguyễn Thu Hà');
    const editor = (await addEditor(t, workspaceId)).client;

    const status = await owner.patch(`/leads/${leadId}`, { status: 'scheduled' }).expect(200);
    expect(status.headers['cache-control']).toBe('no-store');
    expect(leadDetailSchema.parse(status.body).status).toBe('scheduled');
    const noted = await editor
      .patch(`/leads/${leadId}`, { note: '  hẹn gọi lại sau 18h ' })
      .expect(200);
    expect(leadDetailSchema.parse(noted.body)).toMatchObject({
      status: 'scheduled',
      note: 'hẹn gọi lại sau 18h',
    });
    expect((await detail(leadId, editor)).note).toBe('hẹn gọi lại sau 18h');

    await editor.patch(`/leads/${leadId}`, { spam: true }).expect(200);
    expect(names(await inbox(site))).toEqual([]);
    expect(names(await inbox(site, '?folder=spam', editor))).toEqual(['Nguyễn Thu Hà']);
    await owner.patch(`/leads/${leadId}`, { spam: false }).expect(200);
    expect(names(await inbox(site))).toEqual(['Nguyễn Thu Hà']);

    for (const body of [{}, { status: 'lost' }, { note: 'a'.repeat(1001) }, { spam: 'yes' }]) {
      await owner.patch(`/leads/${leadId}`, body).expect(422);
    }
    await owner.patch('/leads/64b0000000000000000000a1', { status: 'won' }).expect(404);
    await owner.patch('/leads/not-an-id', { status: 'won' }).expect(404);
  });

  it('counts leads of the last 7 days on each row of the page list, spam excluded', async () => {
    const { site, pageId, releaseId } = await inboxSite();
    const quiet = await createLiveFormPage(owner, site.id, uniqueSlug('im-lang'));
    await send(site, releaseId, { name: 'Nguyễn Thu Hà' });
    await send(site, releaseId, { name: 'Trần Quốc Bảo' });
    await send(site, releaseId, { name: 'Bot', honeypot: 'x' });
    await insertLeads(t, [
      storedLead({
        workspaceId,
        siteId: site.id,
        pageId,
        releaseId,
        createdAt: new Date(Date.now() - 8 * DAY_MS),
      }),
    ]);
    const pages = await listPages(owner, site.id);
    const rows = new Map(pages.items.map((page) => [page.id, page.leadsLast7Days]));
    expect(rows.get(pageId)).toBe(2);
    expect(rows.get(quiet.pageId)).toBe(0);
  });

  it('lists the pages of the site by title for the page filter', async () => {
    const { site, pageId } = await inboxSite();
    const other = await createPage(owner, site.id, {
      title: 'Cấy ghép Implant',
      slug: uniqueSlug(),
    });
    const response = await owner.get(`/sites/${site.id}/page-refs`).expect(200);
    expect(pageRefListResponseSchema.parse(response.body).items).toEqual([
      { id: other.page.id, title: 'Cấy ghép Implant' },
      { id: pageId, title: 'Đăng ký tư vấn' },
    ]);
  });
});
