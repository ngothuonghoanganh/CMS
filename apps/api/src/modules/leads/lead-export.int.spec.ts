import {
  activityListResponseSchema,
  EXPORT_TRUNCATED_HEADER,
  LEAD_EXPORT_MAX_ROWS,
  type LeadListResponse,
  leadListResponseSchema,
  personDeleteResponseSchema,
  personExportFileSchema,
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
  RecordingRevalidationClient,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../../test/pages.js';
import { configurePrivacy, PRIVACY_SETTINGS } from '../../../test/privacy.js';
import { addEditor, createSite } from '../../../test/resources.js';

const BOM = '﻿';
const HEADER =
  'Thời gian,Họ và tên,Số điện thoại,Email,Lời nhắn,Trang,Nguồn,Chiến dịch,Thiết bị,Trạng thái,Ghi chú,Nhận ưu đãi';

/** Lead exports and a person's data (ADR-017, ADR-018): owner only, logged with counts only. */
describe('lead exports and a person’s data', () => {
  let t: TestApp;
  let owner: TestClient;
  let editor: TestClient;
  let workspaceId: string;

  beforeAll(async () => {
    t = await createTestApp('plp_test_lead_export', {
      ...withRevalidationRecorder(new RecordingRevalidationClient()),
      env: { LEAD_LIMIT_PER_CLIENT: 1000, LEAD_LIMIT_PER_SITE_PER_HOUR: 1000 },
    });
    const signedUp = await signedUpClient(t.app);
    owner = signedUp.client;
    workspaceId = signedUp.workspaceId;
    editor = (await addEditor(t, workspaceId)).client;
  });

  afterAll(async () => {
    await t.close();
  });

  async function formSite() {
    const site = await createSite(owner, workspaceId);
    await configurePrivacy(owner, site.id);
    const slug = uniqueSlug('tu-van');
    const { pageId, published } = await createLiveFormPage(
      owner,
      site.id,
      slug,
      formDraft(slug, leadFormSection({ showEmail: true, showMessage: true })),
    );
    return { site, pageId, releaseId: published.release.id };
  }

  async function send(site: Site, releaseId: string, overrides: Partial<PublicLeadRequest>) {
    await submitLead(t, site.subdomain, leadBody(releaseId, overrides)).expect(201);
  }

  async function inbox(site: Site, query = ''): Promise<LeadListResponse> {
    return leadListResponseSchema.parse(
      (await owner.get(`/sites/${site.id}/leads${query}`).expect(200)).body,
    );
  }

  async function leadIdOf(site: Site, name: string, query = '?range=all'): Promise<string> {
    const lead = (await inbox(site, query)).items.find((item) => item.name === name);
    if (!lead) {
      throw new Error(`No lead named ${name}`);
    }
    return lead.id;
  }

  /** Lead activity of the site, newest first: type and count only. */
  async function leadActivity(site: Site) {
    const response = await owner
      .get(`/sites/${site.id}/activity?types=lead.exported,lead.person_deleted`)
      .expect(200);
    return activityListResponseSchema
      .parse(response.body)
      .items.map((item) => ({ type: item.type, count: item.data.count }));
  }

  function lines(text: string): string[] {
    return text.split('\r\n').filter((line) => line !== '');
  }

  it('exports the filtered leads as a CSV that Excel opens safely', async () => {
    const { site, releaseId } = await formSite();
    await send(site, releaseId, {
      name: 'Nguyễn Thu Hà',
      email: 'thuha@example.com',
      message: 'Gọi sau 18h, "gấp"\nCảm ơn',
      marketing: true,
      source: { utmSource: 'facebook', utmMedium: 'cpc', utmCampaign: 'uu-dai', referrer: null },
    });
    await send(site, releaseId, { name: '=HYPERLINK("http://x")', phone: '0938 512 840' });
    await send(site, releaseId, { name: 'Bot', honeypot: 'x' });

    const response = await owner.post(`/sites/${site.id}/leads/export`, {}).expect(200);
    expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="leads-${site.subdomain}-${vnDayOf(new Date())}.csv"`,
    );
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers[EXPORT_TRUNCATED_HEADER.toLowerCase()]).toBe('false');
    const text = response.text;
    expect(text.startsWith(BOM)).toBe(true);
    // Records end with CRLF; the line break inside the quoted message is a bare LF.
    const [header, ...rows] = lines(text.slice(BOM.length));
    expect(header).toBe(HEADER);
    expect(rows).toHaveLength(2);
    // Newest first; the formula is kept as text.
    expect(rows[0]).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},"'=HYPERLINK\(""http:\/\/x""\)",0938 512 840,/,
    );
    expect(rows[1]).toContain(
      ',Nguyễn Thu Hà,0901 234 567,thuha@example.com,"Gọi sau 18h, ""gấp""\nCảm ơn",Đăng ký tư vấn,facebook / cpc,uu-dai,Máy tính,Mới,,Có',
    );

    const spam = await owner
      .post(`/sites/${site.id}/leads/export`, { folder: 'spam', range: 'all' })
      .expect(200);
    expect(lines(spam.text)).toHaveLength(2);
    expect(spam.text).toContain(',Bot,');

    expect(await leadActivity(site)).toEqual([
      { type: 'lead.exported', count: 1 },
      { type: 'lead.exported', count: 2 },
    ]);
  });

  it(`holds at most ${LEAD_EXPORT_MAX_ROWS} leads and says when more matched`, async () => {
    const { site, pageId, releaseId } = await formSite();
    const now = Date.now();
    await insertLeads(
      t,
      Array.from({ length: LEAD_EXPORT_MAX_ROWS + 1 }, (_, index) =>
        storedLead({
          workspaceId,
          siteId: site.id,
          pageId,
          releaseId,
          name: `Lead ${index}`,
          createdAt: new Date(now - index * 1000),
        }),
      ),
    );
    const response = await owner
      .post(`/sites/${site.id}/leads/export`, { range: 'all' })
      .expect(200);
    expect(response.headers[EXPORT_TRUNCATED_HEADER.toLowerCase()]).toBe('true');
    const rows = lines(response.text).slice(1);
    expect(rows).toHaveLength(LEAD_EXPORT_MAX_ROWS);
    // The newest ones: the oldest lead is left out.
    expect(rows[0]).toContain(',Lead 0,');
    expect(rows.at(-1)).toContain(`,Lead ${LEAD_EXPORT_MAX_ROWS - 1},`);
    expect(response.text).not.toContain(`,Lead ${LEAD_EXPORT_MAX_ROWS},`);
    expect(await leadActivity(site)).toEqual([
      { type: 'lead.exported', count: LEAD_EXPORT_MAX_ROWS },
    ]);
  });

  it('exports every lead of a person as JSON or CSV, with the consent text they agreed to', async () => {
    const { site, releaseId } = await formSite();
    await send(site, releaseId, {
      name: 'Nguyễn Thu Hà',
      email: 'thuha@example.com',
      marketing: true,
    });
    await send(site, releaseId, {
      name: 'Thu Hà',
      phone: '0912 000 111',
      email: 'THUHA@example.com',
    });
    await send(site, releaseId, { name: 'Hà (số cũ)', phone: '0901 234 567' });
    await send(site, releaseId, { name: 'Trần Quốc Bảo', phone: '0938 512 840' });
    const leadId = await leadIdOf(site, 'Nguyễn Thu Hà');

    const json = await owner.post(`/leads/${leadId}/person/export`, { format: 'json' }).expect(200);
    expect(json.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(json.headers['content-disposition']).toBe(
      `attachment; filename="du-lieu-ca-nhan-${site.subdomain}-${vnDayOf(new Date())}.json"`,
    );
    expect(json.headers['cache-control']).toBe('no-store');
    const file = personExportFileSchema.parse(JSON.parse(json.text));
    expect(file.site).toBe(site.name);
    expect(file.leads.map((lead) => lead.name)).toEqual(['Hà (số cũ)', 'Thu Hà', 'Nguyễn Thu Hà']);
    expect(file.leads[2]).toMatchObject({
      phone: '+84901234567',
      email: 'thuha@example.com',
      page: 'Đăng ký tư vấn',
      pageVersion: 1,
      source: 'trực tiếp',
      device: 'Máy tính',
      status: 'Mới',
      consent: {
        version: 1,
        controllerName: PRIVACY_SETTINGS.controllerName,
        policyUrl: PRIVACY_SETTINGS.policyUrl,
        requiredText: `Tôi đồng ý để ${PRIVACY_SETTINGS.controllerName} xử lý họ tên và số điện thoại của tôi nhằm liên hệ tư vấn dịch vụ.`,
        marketing: true,
      },
    });

    const csv = await owner.post(`/leads/${leadId}/person/export`, { format: 'csv' }).expect(200);
    expect(csv.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(csv.text.startsWith(BOM)).toBe(true);
    const csvLines = lines(csv.text);
    expect(csvLines[0]).toBe(`${BOM}${HEADER},Lúc đồng ý,Bản nội dung đồng ý,Nội dung đồng ý`);
    expect(csvLines).toHaveLength(4);
    expect(csv.text).not.toContain('Trần Quốc Bảo');

    await owner.post(`/leads/${leadId}/person/export`, { format: 'xml' }).expect(422);
    expect(await leadActivity(site)).toEqual([
      { type: 'lead.exported', count: 3 },
      { type: 'lead.exported', count: 3 },
    ]);
  });

  it('deletes every lead of a person, and only theirs, with the count in the activity log', async () => {
    const { site, releaseId } = await formSite();
    await send(site, releaseId, { name: 'Nguyễn Thu Hà', email: 'thuha@example.com' });
    await send(site, releaseId, {
      name: 'Thu Hà',
      phone: '0912 000 111',
      email: 'thuha@example.com',
    });
    await send(site, releaseId, { name: 'Bot Hà', phone: '0901 234 567', honeypot: 'x' });
    await send(site, releaseId, { name: 'Trần Quốc Bảo', phone: '0938 512 840' });
    const leadId = await leadIdOf(site, 'Nguyễn Thu Hà');

    const response = await owner.delete(`/leads/${leadId}/person`).expect(200);
    // The email links the second lead, the phone number the spam lead.
    expect(personDeleteResponseSchema.parse(response.body)).toEqual({ deletedCount: 3 });
    expect((await inbox(site, '?range=all')).items.map((item) => item.name)).toEqual([
      'Trần Quốc Bảo',
    ]);
    expect((await inbox(site, '?range=all&folder=spam')).items).toEqual([]);
    await owner.get(`/leads/${leadId}`).expect(404);
    await owner.delete(`/leads/${leadId}/person`).expect(404);
    expect(await leadActivity(site)).toEqual([{ type: 'lead.person_deleted', count: 3 }]);
  });

  it('keeps exports and deletions to the owner; editors read and triage only', async () => {
    const { site, releaseId } = await formSite();
    await send(site, releaseId, { name: 'Nguyễn Thu Hà' });
    const leadId = await leadIdOf(site, 'Nguyễn Thu Hà');

    await editor.get(`/sites/${site.id}/leads`).expect(200);
    await editor.get(`/leads/${leadId}`).expect(200);
    await editor.post(`/sites/${site.id}/leads/export`, {}).expect(403);
    await editor.post(`/leads/${leadId}/person/export`, { format: 'json' }).expect(403);
    await editor.delete(`/leads/${leadId}/person`).expect(403);
    await owner.get(`/leads/${leadId}`).expect(200);
    expect(await leadActivity(site)).toEqual([]);
  });

  it('refuses an export with filters the inbox does not know', async () => {
    const { site } = await formSite();
    await owner.post(`/sites/${site.id}/leads/export`, { range: 'custom' }).expect(422);
    await owner.post(`/sites/${site.id}/leads/export`, { folder: 'trash' }).expect(422);
  });
});
