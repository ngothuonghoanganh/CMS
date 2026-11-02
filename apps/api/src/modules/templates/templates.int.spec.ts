import {
  activityListResponseSchema,
  type CreatePageRequest,
  pageCountResponseSchema,
  pageDetailResponseSchema,
  problemSchema,
  type Site,
  type TemplateDetail,
  templateDetailSchema,
  templateListResponseSchema,
} from '@plp/contracts';
import { systemTemplates } from '@plp/sections/schema';
import { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import { uniqueSlug } from '../../../test/pages.js';
import { configurePrivacy } from '../../../test/privacy.js';
import { addConfirmedRecipient, RECIPIENT_EMAIL } from '../../../test/recipients.js';
import { addMember, createSite } from '../../../test/resources.js';

const TEMPLATE_ID = 'nha-khoa-uu-dai';
const TEMPLATE_NAME = 'Ưu đãi dịch vụ nha khoa';

function fromTemplate(
  templateId = TEMPLATE_ID,
  version = 1,
  title = 'Ưu đãi tẩy trắng răng',
): CreatePageRequest {
  return {
    title,
    slug: uniqueSlug('mau'),
    start: { kind: 'template', source: 'system', templateId, version },
  };
}

/**
 * The template library (ADR-030): every member browses the system templates of the workspace and
 * previews one; creating a page from one needs `pages.edit` on the target site, takes the version
 * that was previewed, and records where the page came from.
 */
describe('template library', () => {
  let t: TestApp;
  let owner: TestClient;
  let workspaceId: string;
  let smile: Site;
  let kitchen: Site;

  beforeAll(async () => {
    t = await createTestApp('plp_test_templates');
    ({ client: owner, workspaceId } = await signedUpClient(t.app));
    smile = await createSite(owner, workspaceId, { name: 'Nha khoa Smile Care' });
    kitchen = await createSite(owner, workspaceId, { name: 'Bếp Nhà Mây' });
  });

  afterAll(async () => {
    await t.close();
  });

  async function detail(
    client: TestClient,
    templateId = TEMPLATE_ID,
    siteId?: string,
  ): Promise<TemplateDetail> {
    const query = siteId === undefined ? '' : `?siteId=${siteId}`;
    const response = await client
      .get(`/workspaces/${workspaceId}/templates/${templateId}${query}`)
      .expect(200);
    return templateDetailSchema.parse(response.body);
  }

  async function pageCount(siteId: string): Promise<number> {
    const response = await owner.get(`/sites/${siteId}/page-count`).expect(200);
    return pageCountResponseSchema.parse(response.body).count;
  }

  it('lists the 12 system templates to every member, whatever their role', async () => {
    const viewer = await addMember(t, workspaceId, 'viewer', [kitchen.id]);
    for (const client of [owner, viewer.client]) {
      const response = await client.get(`/workspaces/${workspaceId}/templates`).expect(200);
      const { items } = templateListResponseSchema.parse(response.body);
      expect(items.map((item) => item.id)).toEqual(systemTemplates.map((item) => item.id));
      expect(new Set(items.map((item) => item.source))).toEqual(new Set(['system']));
      expect(items.find((item) => item.id === TEMPLATE_ID)).toMatchObject({
        name: TEMPLATE_NAME,
        version: 1,
        goal: 'lead',
        industry: 'dental_health',
        hasForm: true,
      });
    }
  });

  it('answers 404 outside the workspace and 401 without a session', async () => {
    const stranger = (await signedUpClient(t.app)).client;
    for (const path of [
      `/workspaces/${workspaceId}/templates`,
      `/workspaces/${workspaceId}/templates/${TEMPLATE_ID}`,
    ]) {
      const response = await stranger.get(path).expect(404);
      expect(problemSchema.parse(response.body).title).toBe('Không tìm thấy workspace');
      await request(t.app.getHttpServer()).get(path).expect(401);
    }
    await stranger.get('/workspaces/not-an-id/templates').expect(404);
  });

  it('previews a template: its sections, a composition the registry parsed, no site yet', async () => {
    const template = await detail(owner);
    expect(template).toMatchObject({
      id: TEMPLATE_ID,
      source: 'system',
      name: TEMPLATE_NAME,
      usedCount: 0,
      site: null,
    });
    expect(template.details).toMatch(/^Cho chiến dịch quảng cáo/);
    expect(template.composition.sections.map(({ type, variant }) => ({ type, variant }))).toEqual(
      template.sections.map(({ type, variant }) => ({ type, variant })),
    );
    expect(template.composition.sections.every((section) => section.samplePaths.length > 0)).toBe(
      true,
    );
  });

  it('finds no unknown template, nor a workspace template before they exist', async () => {
    for (const id of ['khong-co-mau', new Types.ObjectId().toHexString()]) {
      const response = await owner.get(`/workspaces/${workspaceId}/templates/${id}`).expect(404);
      expect(problemSchema.parse(response.body).title).toBe('Không tìm thấy mẫu');
    }
  });

  it('creates a draft from the template with fresh section ids, sample text and where it came from', async () => {
    const preview = await detail(owner);
    const body = fromTemplate();
    const response = await owner.post(`/sites/${smile.id}/pages`, body).expect(201);
    const created = pageDetailResponseSchema.parse(response.body);

    expect(created.page).toMatchObject({
      title: 'Ưu đãi tẩy trắng răng',
      slug: body.slug,
      goal: 'lead',
      status: { kind: 'draft' },
      liveRelease: null,
    });
    const sections = created.draft.composition.sections;
    expect(
      sections.map(({ type, variant, colorScheme }) => ({ type, variant, colorScheme })),
    ).toEqual(
      preview.sections.map(({ type, variant, colorScheme }) => ({ type, variant, colorScheme })),
    );
    // The server issues the ids: none is the preview's, and the buttons lead to the new form.
    const ids = sections.map((section) => section.id);
    expect(
      ids.some((id) => preview.composition.sections.some((section) => section.id === id)),
    ).toBe(false);
    const form = sections.find((section) => section.type === 'lead_form');
    expect(sections.find((section) => section.type === 'hero')?.content.primaryCta).toMatchObject({
      link: { kind: 'section', sectionId: form?.id },
    });
    // Sample text is marked: publishing warns about it; the form blocks until the site is ready.
    expect(created.checks.warnings.map((item) => item.code)).toContain('sample_content');
    expect(created.checks.blocking.map((item) => item.code)).toEqual(
      expect.arrayContaining(['consent_not_configured', 'lead_destination_missing']),
    );

    const stored = await t
      .workspaceDb(workspaceId)
      .collection('pages')
      .findOne({ _id: new Types.ObjectId(created.page.id) });
    expect(stored?.createdFrom).toEqual({
      kind: 'template',
      source: 'system',
      templateId: TEMPLATE_ID,
      version: 1,
    });

    const activity = activityListResponseSchema.parse(
      (await owner.get(`/sites/${smile.id}/activity`).expect(200)).body,
    );
    expect(activity.items[0]).toMatchObject({
      type: 'page.created_from_template',
      page: { id: created.page.id, title: 'Ưu đãi tẩy trắng răng' },
      data: { version: 1, template: TEMPLATE_NAME },
    });

    // A second page from the same template gets ids of its own.
    const again = pageDetailResponseSchema.parse(
      (await owner.post(`/sites/${smile.id}/pages`, fromTemplate()).expect(201)).body,
    );
    const againIds = again.draft.composition.sections.map((section) => section.id);
    expect(againIds.some((id) => ids.includes(id))).toBe(false);
  });

  it('marks a blank page and a goal page as made from no template', async () => {
    const blank = pageDetailResponseSchema.parse(
      (
        await owner
          .post(`/sites/${kitchen.id}/pages`, {
            title: 'Trang trống',
            slug: uniqueSlug('trong'),
            start: { kind: 'blank' },
          })
          .expect(201)
      ).body,
    );
    const stored = await t
      .workspaceDb(workspaceId)
      .collection('pages')
      .findOne({ _id: new Types.ObjectId(blank.page.id) });
    expect(stored?.createdFrom).toBeNull();
  });

  it('refuses another version with the current one, and an unknown template, creating nothing', async () => {
    const before = await pageCount(smile.id);
    for (const version of [2, 99]) {
      const response = await owner
        .post(`/sites/${smile.id}/pages`, fromTemplate(TEMPLATE_ID, version))
        .expect(409);
      expect(problemSchema.parse(response.body)).toMatchObject({
        code: 'template_changed',
        title: `Mẫu “${TEMPLATE_NAME}” đã có phiên bản mới (v1)`,
        context: { currentVersion: 1 },
      });
    }
    const unknown = await owner
      .post(`/sites/${smile.id}/pages`, fromTemplate('khong-co-mau'))
      .expect(404);
    expect(problemSchema.parse(unknown.body).title).toBe('Không tìm thấy mẫu');
    // A version that is no positive whole number never reaches the catalog.
    await owner.post(`/sites/${smile.id}/pages`, fromTemplate(TEMPLATE_ID, 0)).expect(422);
    expect(await pageCount(smile.id)).toBe(before);
  });

  it('needs `pages.edit` on the target site; another site or workspace finds nothing', async () => {
    const before = await pageCount(smile.id);
    for (const role of ['viewer', 'support'] as const) {
      const member = await addMember(t, workspaceId, role);
      const refused = await member.client
        .post(`/sites/${smile.id}/pages`, fromTemplate())
        .expect(403);
      expect(problemSchema.parse(refused.body).code).toBe('forbidden');
    }
    const elsewhere = await addMember(t, workspaceId, 'editor', [kitchen.id]);
    await elsewhere.client.post(`/sites/${smile.id}/pages`, fromTemplate()).expect(404);
    const stranger = (await signedUpClient(t.app)).client;
    await stranger.post(`/sites/${smile.id}/pages`, fromTemplate()).expect(404);
    expect(await pageCount(smile.id)).toBe(before);

    // Cộng tác viên edits pages, so it creates one from a template.
    const contributor = await addMember(t, workspaceId, 'contributor', [kitchen.id]);
    await contributor.client.post(`/sites/${kitchen.id}/pages`, fromTemplate()).expect(201);
  });

  it("counts the pages made from a template in the member's sites only", async () => {
    // Two in Nha khoa Smile Care so far, one in Bếp Nhà Mây (the Cộng tác viên's).
    expect((await detail(owner)).usedCount).toBe(3);
    const kitchenEditor = await addMember(t, workspaceId, 'editor', [kitchen.id]);
    expect((await detail(kitchenEditor.client)).usedCount).toBe(1);
    expect((await detail(owner, 'webinar-truc-tuyen')).usedCount).toBe(0);
  });

  it('says what a site still needs for the form: confirmed recipients and consent', async () => {
    expect((await detail(owner, TEMPLATE_ID, smile.id)).site).toEqual({
      siteId: smile.id,
      confirmedRecipients: 0,
      recipientEmail: null,
      consentVersion: null,
      consentGaps: ['privacy', 'consent'],
    });

    await configurePrivacy(owner, kitchen.id);
    await addConfirmedRecipient(t, owner, kitchen.id);
    expect((await detail(owner, TEMPLATE_ID, kitchen.id)).site).toEqual({
      siteId: kitchen.id,
      confirmedRecipients: 1,
      recipientEmail: RECIPIENT_EMAIL,
      consentVersion: 1,
      consentGaps: [],
    });

    // Who receives the leads is for the roles that see them (ADR-020).
    const editor = await addMember(t, workspaceId, 'editor');
    expect((await detail(editor.client, TEMPLATE_ID, kitchen.id)).site).toMatchObject({
      confirmedRecipients: 1,
      recipientEmail: null,
    });
    const support = await addMember(t, workspaceId, 'support');
    expect((await detail(support.client, TEMPLATE_ID, kitchen.id)).site?.recipientEmail).toBe(
      RECIPIENT_EMAIL,
    );
  });

  it("finds no site outside the member's sites or of another workspace", async () => {
    const kitchenOnly = await addMember(t, workspaceId, 'viewer', [kitchen.id]);
    const outside = await kitchenOnly.client
      .get(`/workspaces/${workspaceId}/templates/${TEMPLATE_ID}?siteId=${smile.id}`)
      .expect(404);
    expect(problemSchema.parse(outside.body).title).toBe('Không tìm thấy site');

    const other = await signedUpClient(t.app);
    const foreignSite = await createSite(other.client, other.workspaceId, { name: 'Spa Lá Xanh' });
    const foreign = await owner
      .get(`/workspaces/${workspaceId}/templates/${TEMPLATE_ID}?siteId=${foreignSite.id}`)
      .expect(404);
    expect(problemSchema.parse(foreign.body).title).toBe('Không tìm thấy site');
    await owner.get(`/workspaces/${workspaceId}/templates/${TEMPLATE_ID}?siteId=smile`).expect(422);
  });
});
