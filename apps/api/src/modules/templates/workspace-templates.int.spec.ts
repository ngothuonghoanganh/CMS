import {
  activityListResponseSchema,
  assetListResponseSchema,
  type CreateWorkspaceTemplateRequest,
  MAX_TEMPLATE_VERSIONS,
  MAX_WORKSPACE_TEMPLATES,
  type PageDetailResponse,
  pageDetailResponseSchema,
  problemSchema,
  type Site,
  type TemplateDetail,
  templateCompositionResponseSchema,
  templateDetailSchema,
  templateListResponseSchema,
  templateVersionListResponseSchema,
  type WorkspaceTemplate,
  workspaceTemplateListResponseSchema,
  workspaceTemplateSchema,
} from '@plp/contracts';
import { findSystemTemplate, getAtPath } from '@plp/sections/schema';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import { cleanSeo, composition, heroSection } from '../../../test/compositions.js';
import { createPage, getPage, publish, replaceDraft, uniqueSlug } from '../../../test/pages.js';
import { addMember, createSite, uploadImage } from '../../../test/resources.js';
import { WorkspaceDatabases } from '../../shared/persistence/workspace-databases.js';
import { TEMPLATE_VERSION_COLLECTION } from './template.schema.js';

const HEADING = 'Niềng răng trong suốt cho người bận rộn';

/**
 * Workspace templates (ADR-030, slices G2 and G3): a page saved as a template with immutable
 * versions and its own copies of its images, limited to some sites or not, archived instead of
 * deleted; pages and drafts made from it get copies of those images in their own site.
 */
describe('workspace templates', () => {
  let t: TestApp;
  let owner: TestClient;
  let workspaceId: string;
  let smile: Site;
  let kitchen: Site;
  let spa: Site;

  beforeAll(async () => {
    t = await createTestApp('plp_test_ws_templates');
    ({ client: owner, workspaceId } = await signedUpClient(t.app));
    smile = await createSite(owner, workspaceId, { name: 'Nha khoa Smile Care' });
    kitchen = await createSite(owner, workspaceId, { name: 'Bếp Nhà Mây' });
    spa = await createSite(owner, workspaceId, { name: 'Spa Lá Xanh' });
  });

  afterAll(async () => {
    await t.close();
  });

  const base = () => `/workspaces/${workspaceId}/workspace-templates`;

  /** A page of the site whose draft is a Hero with an uploaded photo. */
  async function pageWithPhoto(
    client: TestClient,
    site: Site,
    options: { live?: boolean; heading?: string } = {},
  ): Promise<{ pageId: string; assetId: string }> {
    const asset = await uploadImage(client, site.id, { alt: 'Bác sĩ đang tư vấn' });
    const slug = uniqueSlug('nieng');
    const page = await createPage(client, site.id, { title: 'Niềng răng tháng 9', slug });
    await replaceDraft(client, site.id, page.page.id, {
      slug,
      composition: composition([
        heroSection({
          heading: options.heading ?? HEADING,
          image: { assetId: asset.id, alt: 'Bác sĩ đang tư vấn', decorative: false },
        }),
      ]),
      seo: cleanSeo(),
    });
    if (options.live === true) {
      await publish(client, site.id, page.page.id);
    }
    return { pageId: page.page.id, assetId: asset.id };
  }

  function saveBody(
    siteId: string,
    pageId: string,
    overrides: Partial<CreateWorkspaceTemplateRequest> = {},
  ): CreateWorkspaceTemplateRequest {
    return {
      source: { siteId, pageId, kind: 'draft' },
      content: 'keep',
      note: '',
      name: 'Tư vấn niềng răng trả góp',
      description: 'Bản đã dùng cho Smile Care.',
      goal: 'lead',
      industry: 'dental_health',
      scope: { kind: 'workspace' },
      ...overrides,
    };
  }

  async function saveTemplate(
    client: TestClient,
    body: CreateWorkspaceTemplateRequest,
  ): Promise<WorkspaceTemplate> {
    const response = await client.post(base(), body).expect(201);
    return workspaceTemplateSchema.parse(response.body);
  }

  async function detail(
    client: TestClient,
    templateId: string,
    query = '',
  ): Promise<TemplateDetail> {
    const response = await client
      .get(`/workspaces/${workspaceId}/templates/${templateId}${query}`)
      .expect(200);
    return templateDetailSchema.parse(response.body);
  }

  async function library(client: TestClient) {
    const response = await client.get(`/workspaces/${workspaceId}/templates`).expect(200);
    return templateListResponseSchema.parse(response.body).items;
  }

  async function board(client: TestClient) {
    const response = await client.get(base()).expect(200);
    return workspaceTemplateListResponseSchema.parse(response.body).items;
  }

  function fromTemplate(templateId: string, version: number) {
    return {
      title: 'Niềng răng cho khách mới',
      slug: uniqueSlug('mau'),
      start: { kind: 'template', source: 'workspace', templateId, version },
    };
  }

  /** The stored asset of a site, by id: where its object is. */
  async function storedAsset(siteId: string, assetId: string) {
    return t
      .workspaceDb(workspaceId)
      .collection('assets')
      .findOne({ _id: new Types.ObjectId(assetId), siteId: new Types.ObjectId(siteId) });
  }

  function imageOf(page: PageDetailResponse): string {
    const image = getAtPath(page.draft.composition.sections[0]?.content, 'image.assetId');
    if (typeof image !== 'string') {
      throw new Error('The page has no image');
    }
    return image;
  }

  it('saves a draft with every text marked as sample and no photo, and logs it', async () => {
    const { pageId } = await pageWithPhoto(owner, smile);
    const saved = await saveTemplate(
      owner,
      saveBody(smile.id, pageId, { content: 'sample', note: 'Bản đầu' }),
    );
    expect(saved).toMatchObject({
      name: 'Tư vấn niềng răng trả góp',
      goal: 'lead',
      industry: 'dental_health',
      scope: { kind: 'workspace' },
      currentVersion: 1,
      archived: false,
      usedCount: 0,
      hasForm: false,
    });
    expect(saved.sections.map((section) => section.type)).toEqual(['hero']);
    expect(saved.sections[0]?.label).toBe(`Hero · “${HEADING}”`);

    const shown = await detail(owner, saved.id);
    const hero = shown.composition.sections[0];
    expect(hero?.samplePaths).toEqual(
      expect.arrayContaining(['heading', 'subheading', 'primaryCta.label']),
    );
    expect(getAtPath(hero?.content, 'image')).toEqual({
      assetId: null,
      alt: '',
      decorative: false,
    });
    expect(getAtPath(hero?.content, 'heading')).toBe(HEADING);
    expect(shown.images).toEqual({});
    expect(shown).toMatchObject({ source: 'workspace', version: 1, currentVersion: 1 });

    // The library lists it after the system templates, with its source and its sites.
    const items = await library(owner);
    expect(items.find((item) => item.id === saved.id)).toMatchObject({
      source: 'workspace',
      name: 'Tư vấn niềng răng trả góp',
      siteIds: null,
    });
    expect(items.findIndex((item) => item.id === saved.id)).toBeGreaterThanOrEqual(12);

    const activity = activityListResponseSchema.parse(
      (await owner.get(`/sites/${smile.id}/activity`).expect(200)).body,
    );
    expect(activity.items[0]).toMatchObject({
      type: 'template.saved',
      page: { id: pageId, title: 'Niềng răng tháng 9' },
      data: { template: 'Tư vấn niềng răng trả góp', version: 1 },
    });
  });

  it('keeps photos as copies of its own, which outlive the source site, and gives a new page copies in its site', async () => {
    const source = await createSite(owner, workspaceId, { name: 'Nha khoa sắp đóng' });
    const { pageId, assetId } = await pageWithPhoto(owner, source, { live: true });
    // The live release is what is saved, not a later draft.
    await replaceDraft(owner, source.id, pageId, {
      slug: (await getPage(owner, source.id, pageId)).draft.slug,
      composition: composition([heroSection({ heading: 'Bản nháp chưa xuất bản' })]),
      seo: cleanSeo(),
    });
    const saved = await saveTemplate(
      owner,
      saveBody(source.id, pageId, {
        source: { siteId: source.id, pageId, kind: 'live' },
        scope: { kind: 'sites', siteIds: [source.id, kitchen.id] },
      }),
    );
    const shown = await detail(owner, saved.id);
    expect(getAtPath(shown.composition.sections[0]?.content, 'heading')).toBe(HEADING);
    const templateImage = getAtPath(shown.composition.sections[0]?.content, 'image.assetId');
    expect(typeof templateImage).toBe('string');
    expect(templateImage).not.toBe(assetId);
    const image = shown.images[String(templateImage)];
    expect(image?.url).toContain(`/public/${workspaceId}/templates/`);
    expect((await fetch(image?.url ?? '')).status).toBe(200);

    await owner.delete(`/sites/${source.id}`).send({ confirmName: source.name }).expect(204);

    // The template and its photo are still there; the site left the sites that may use it.
    const after = await detail(owner, saved.id);
    expect(after.images).toEqual(shown.images);
    expect((await fetch(image?.url ?? '')).status).toBe(200);
    expect((await board(owner)).find((item) => item.id === saved.id)?.scope).toEqual({
      kind: 'sites',
      siteIds: [kitchen.id],
    });

    // A page made from it in another site holds a copy of the photo as that site's asset.
    const created = pageDetailResponseSchema.parse(
      (await owner.post(`/sites/${kitchen.id}/pages`, fromTemplate(saved.id, 1)).expect(201)).body,
    );
    const pageImage = imageOf(created);
    expect(pageImage).not.toBe(templateImage);
    const stored = await storedAsset(kitchen.id, pageImage);
    expect(stored?.['storageKey']).toMatch(new RegExp(`^public/${workspaceId}/${kitchen.id}/`));
    expect(stored?.['alt']).toBe('Bác sĩ đang tư vấn');
    const assets = assetListResponseSchema.parse(
      (await owner.get(`/sites/${kitchen.id}/assets?ids=${pageImage}`).expect(200)).body,
    );
    expect(assets.items).toHaveLength(1);
    expect((await fetch(assets.items[0]?.url ?? '')).status).toBe(200);
    // The new page saves as any other: its image is its site's own.
    await replaceDraft(owner, kitchen.id, created.page.id, {
      slug: created.draft.slug,
      composition: created.draft.composition,
      seo: created.draft.seo,
    });

    expect((await board(owner)).find((item) => item.id === saved.id)?.usedCount).toBe(1);
    const activity = activityListResponseSchema.parse(
      (await owner.get(`/sites/${kitchen.id}/activity`).expect(200)).body,
    );
    expect(activity.items[0]).toMatchObject({
      type: 'page.created_from_template',
      data: { template: 'Tư vấn niềng răng trả góp', version: 1 },
    });
  });

  it('refuses the live release of a page that is not live', async () => {
    const { pageId } = await pageWithPhoto(owner, smile);
    const response = await owner
      .post(
        base(),
        saveBody(smile.id, pageId, { source: { siteId: smile.id, pageId, kind: 'live' } }),
      )
      .expect(409);
    expect(problemSchema.parse(response.body).code).toBe('page_not_live');
  });

  it('adds immutable versions, reuses an old one, and refuses a page from an older version', async () => {
    const { pageId } = await pageWithPhoto(owner, smile, { heading: 'Phiên bản một' });
    const saved = await saveTemplate(owner, saveBody(smile.id, pageId));
    const v1 = await detail(owner, saved.id);

    const { pageId: second } = await pageWithPhoto(owner, smile, { heading: 'Phiên bản hai' });
    const versionBody = {
      source: { siteId: smile.id, pageId: second, kind: 'draft' },
      content: 'keep',
      note: 'Thêm FAQ về trả góp',
      name: 'Tư vấn niềng răng trả góp 0%',
      baseVersion: 1,
    };
    const v2 = workspaceTemplateSchema.parse(
      (await owner.post(`${base()}/${saved.id}/versions`, versionBody).expect(201)).body,
    );
    expect(v2).toMatchObject({ currentVersion: 2, name: 'Tư vấn niềng răng trả góp 0%' });

    // On top of a version that is no longer the current one: 409, nothing saved.
    const stale = await owner.post(`${base()}/${saved.id}/versions`, versionBody).expect(409);
    expect(problemSchema.parse(stale.body)).toMatchObject({
      code: 'template_changed',
      context: { currentVersion: 2 },
    });

    // "Dùng lại v1": v3 holds v1's content; v1 and v2 stay as they were.
    const v3 = workspaceTemplateSchema.parse(
      (await owner.post(`${base()}/${saved.id}/versions/1/reuse`, { baseVersion: 2 }).expect(201))
        .body,
    );
    expect(v3.currentVersion).toBe(3);
    expect((await detail(owner, saved.id)).composition).toEqual(v1.composition);
    expect((await detail(owner, saved.id, '?version=1')).composition).toEqual(v1.composition);
    expect(
      getAtPath(
        (await detail(owner, saved.id, '?version=2')).composition.sections[0]?.content,
        'heading',
      ),
    ).toBe('Phiên bản hai');
    await owner.get(`/workspaces/${workspaceId}/templates/${saved.id}?version=4`).expect(404);
    await owner.post(`${base()}/${saved.id}/versions/9/reuse`, { baseVersion: 3 }).expect(404);

    const versions = templateVersionListResponseSchema.parse(
      (await owner.get(`${base()}/${saved.id}/versions`).expect(200)).body,
    );
    expect(
      versions.items.map(({ version, note, reusedFrom, source }) => ({
        version,
        note,
        reusedFrom,
        page: source.pageTitle,
      })),
    ).toEqual([
      { version: 3, note: '', reusedFrom: 1, page: 'Niềng răng tháng 9' },
      { version: 2, note: 'Thêm FAQ về trả góp', reusedFrom: null, page: 'Niềng răng tháng 9' },
      { version: 1, note: '', reusedFrom: null, page: 'Niềng răng tháng 9' },
    ]);

    // A page is made from the version the user previewed only while it is the current one.
    const older = await owner
      .post(`/sites/${smile.id}/pages`, fromTemplate(saved.id, 2))
      .expect(409);
    expect(problemSchema.parse(older.body)).toMatchObject({
      code: 'template_changed',
      title: 'Mẫu “Tư vấn niềng răng trả góp 0%” đã có phiên bản mới (v3)',
      context: { currentVersion: 3 },
    });
    await owner.post(`/sites/${smile.id}/pages`, fromTemplate(saved.id, 3)).expect(201);
    const counted = templateVersionListResponseSchema.parse(
      (await owner.get(`${base()}/${saved.id}/versions`).expect(200)).body,
    );
    expect(counted.items.map((item) => item.usedCount)).toEqual([1, 0, 0]);

    // The collection itself refuses to change a version.
    const versionsModel = t.app
      .get(WorkspaceDatabases)
      .model({ workspaceId: new Types.ObjectId(workspaceId) }, TEMPLATE_VERSION_COLLECTION);
    await expect(
      versionsModel.updateOne({ templateId: new Types.ObjectId(saved.id) }, { note: 'Sửa' }).exec(),
    ).rejects.toThrow(/immutable/);
    await expect(
      versionsModel.deleteMany({ templateId: new Types.ObjectId(saved.id) }).exec(),
    ).rejects.toThrow(/immutable/);
  });

  it('edits its information, duplicates it, archives and restores it', async () => {
    const { pageId } = await pageWithPhoto(owner, smile);
    const saved = await saveTemplate(owner, saveBody(smile.id, pageId));
    const edited = workspaceTemplateSchema.parse(
      (
        await owner
          .patch(`${base()}/${saved.id}`, {
            name: 'Thực đơn mới & đặt bàn',
            description: 'Món mới theo mùa.',
            goal: 'product',
            industry: 'food_beverage',
            scope: { kind: 'sites', siteIds: [kitchen.id] },
          })
          .expect(200)
      ).body,
    );
    expect(edited).toMatchObject({
      name: 'Thực đơn mới & đặt bàn',
      goal: 'product',
      industry: 'food_beverage',
      scope: { kind: 'sites', siteIds: [kitchen.id] },
      currentVersion: 1,
    });

    const copy = workspaceTemplateSchema.parse(
      (await owner.post(`${base()}/${saved.id}/duplicate`).expect(201)).body,
    );
    expect(copy).toMatchObject({
      name: 'Thực đơn mới & đặt bàn (bản sao)',
      currentVersion: 1,
      scope: { kind: 'sites', siteIds: [kitchen.id] },
    });
    expect((await detail(owner, copy.id)).composition).toEqual(
      (await detail(owner, saved.id)).composition,
    );

    const archived = workspaceTemplateSchema.parse(
      (await owner.post(`${base()}/${saved.id}/archive`).expect(200)).body,
    );
    expect(archived.archived).toBe(true);
    expect((await library(owner)).some((item) => item.id === saved.id)).toBe(false);
    expect((await board(owner)).find((item) => item.id === saved.id)?.archived).toBe(true);
    expect((await detail(owner, saved.id)).archived).toBe(true);
    const refused = await owner
      .post(`/sites/${kitchen.id}/pages`, fromTemplate(saved.id, 1))
      .expect(409);
    expect(problemSchema.parse(refused.body).code).toBe('template_archived');

    await owner.post(`${base()}/${saved.id}/restore`).expect(200);
    expect((await library(owner)).some((item) => item.id === saved.id)).toBe(true);
    // There is no delete: pages made from a template keep its id.
    await owner.delete(`${base()}/${saved.id}`).expect(404);
  });

  it('is seen and used only for its sites', async () => {
    const { pageId } = await pageWithPhoto(owner, smile);
    const limited = await saveTemplate(
      owner,
      saveBody(smile.id, pageId, { scope: { kind: 'sites', siteIds: [smile.id, spa.id] } }),
    );
    const outsider = await addMember(t, workspaceId, 'editor', [kitchen.id]);
    const insider = await addMember(t, workspaceId, 'editor', [smile.id, kitchen.id]);

    expect((await library(outsider.client)).some((item) => item.id === limited.id)).toBe(false);
    expect((await board(outsider.client)).some((item) => item.id === limited.id)).toBe(false);
    for (const path of [
      `/workspaces/${workspaceId}/templates/${limited.id}`,
      `${base()}/${limited.id}/versions`,
    ]) {
      await outsider.client.get(path).expect(404);
    }
    await outsider.client.post(`${base()}/${limited.id}/archive`).expect(404);

    // A member of one of its sites sees it, with only the sites that are theirs.
    expect((await library(insider.client)).find((item) => item.id === limited.id)?.siteIds).toEqual(
      [smile.id],
    );
    // Their edit keeps the site they do not see.
    const edited = workspaceTemplateSchema.parse(
      (
        await insider.client
          .patch(`${base()}/${limited.id}`, {
            name: limited.name,
            description: '',
            goal: null,
            industry: null,
            scope: { kind: 'sites', siteIds: [kitchen.id] },
          })
          .expect(200)
      ).body,
    );
    expect(edited.scope).toEqual({ kind: 'sites', siteIds: [kitchen.id] });
    expect((await board(owner)).find((item) => item.id === limited.id)?.scope).toEqual({
      kind: 'sites',
      siteIds: [kitchen.id, spa.id],
    });
    // A site that is not theirs cannot be chosen.
    const notTheirs = await insider.client
      .patch(`${base()}/${limited.id}`, {
        name: limited.name,
        description: '',
        goal: null,
        industry: null,
        scope: { kind: 'sites', siteIds: [spa.id] },
      })
      .expect(422);
    expect(problemSchema.parse(notTheirs.body).code).toBe('validation_failed');

    // Nor can they take a template every site uses away from the sites they do not see.
    const everywhere = await saveTemplate(owner, saveBody(smile.id, pageId));
    const narrowed = await insider.client
      .patch(`${base()}/${everywhere.id}`, {
        name: everywhere.name,
        description: '',
        goal: null,
        industry: null,
        scope: { kind: 'sites', siteIds: [smile.id] },
      })
      .expect(422);
    expect(problemSchema.parse(narrowed.body).issues).toEqual([
      {
        path: ['scope', 'siteIds'],
        code: 'narrows_workspace',
        message:
          'Mẫu này đang dùng cho mọi site. Chỉ thành viên của toàn workspace mới giới hạn được nó.',
      },
    ]);
    expect((await board(owner)).find((item) => item.id === everywhere.id)?.scope).toEqual({
      kind: 'workspace',
    });

    // Used in its sites only, even by Chủ sở hữu.
    const page = await createPage(owner, smile.id);
    await owner.post(`/sites/${smile.id}/pages`, fromTemplate(limited.id, 1)).expect(404);
    await owner
      .post(`/sites/${smile.id}/pages/${page.page.id}/draft/template`, {
        baseRevision: page.draft.revision,
        template: { source: 'workspace', templateId: limited.id, version: 1 },
      })
      .expect(404);
    await owner.post(`/sites/${kitchen.id}/pages`, fromTemplate(limited.id, 1)).expect(201);
  });

  it('belongs to its workspace: another one finds nothing', async () => {
    const { pageId } = await pageWithPhoto(owner, smile);
    const saved = await saveTemplate(owner, saveBody(smile.id, pageId));
    const other = await signedUpClient(t.app);
    const otherSite = await createSite(other.client, other.workspaceId);
    const otherBase = `/workspaces/${other.workspaceId}/workspace-templates`;

    await other.client.get(base()).expect(404);
    await other.client.get(`/workspaces/${workspaceId}/templates/${saved.id}`).expect(404);
    await other.client.get(`/workspaces/${other.workspaceId}/templates/${saved.id}`).expect(404);
    await other.client.get(`${otherBase}/${saved.id}/versions`).expect(404);
    await other.client.post(`${otherBase}/${saved.id}/duplicate`).expect(404);
    // Nor can a page of this workspace be saved into theirs.
    await other.client.post(otherBase, saveBody(smile.id, pageId)).expect(404);
    await other.client.post(`/sites/${otherSite.id}/pages`, fromTemplate(saved.id, 1)).expect(404);
  });

  it(`keeps ${MAX_WORKSPACE_TEMPLATES} templates per workspace and ${MAX_TEMPLATE_VERSIONS} versions per template`, async () => {
    const own = await signedUpClient(t.app);
    const site = await createSite(own.client, own.workspaceId);
    const page = await createPage(own.client, site.id);
    const ownBase = `/workspaces/${own.workspaceId}/workspace-templates`;
    const body = {
      ...saveBody(site.id, page.page.id),
    };
    const first = workspaceTemplateSchema.parse(
      (await own.client.post(ownBase, body).expect(201)).body,
    );
    const now = new Date();
    const owner = new Types.ObjectId(own.me.user.id);
    await t
      .workspaceDb(own.workspaceId)
      .collection('templates')
      .insertMany(
        Array.from({ length: MAX_WORKSPACE_TEMPLATES - 2 }, (_item, index) => ({
          workspaceId: new Types.ObjectId(own.workspaceId),
          name: `Mẫu ${index}`,
          description: '',
          goal: null,
          industry: null,
          scope: { kind: 'workspace' },
          currentVersion: 1,
          archivedAt: index % 2 === 0 ? now : null,
          createdBy: owner,
          createdAt: now,
          updatedAt: now,
          updatedBy: owner,
        })),
      );
    await own.client.post(ownBase, body).expect(201);
    const full = await own.client.post(ownBase, body).expect(409);
    expect(problemSchema.parse(full.body).code).toBe('template_limit_reached');
    const copy = await own.client.post(`${ownBase}/${first.id}/duplicate`).expect(409);
    expect(problemSchema.parse(copy.body).code).toBe('template_limit_reached');

    await t
      .workspaceDb(own.workspaceId)
      .collection('templates')
      .updateOne(
        { _id: new Types.ObjectId(first.id) },
        { $set: { currentVersion: MAX_TEMPLATE_VERSIONS } },
      );
    const last = await own.client
      .post(`${ownBase}/${first.id}/versions`, {
        source: { siteId: site.id, pageId: page.page.id, kind: 'draft' },
        content: 'keep',
        note: '',
        name: first.name,
        baseVersion: MAX_TEMPLATE_VERSIONS,
      })
      .expect(409);
    expect(problemSchema.parse(last.body).code).toBe('template_version_limit_reached');
  });

  it('replaces the sections of a draft at its revision, keeping the title, slug, SEO and live page', async () => {
    const { pageId } = await pageWithPhoto(owner, kitchen, { live: true });
    const before = await getPage(owner, kitchen.id, pageId);
    const stale = await owner
      .post(`/sites/${kitchen.id}/pages/${pageId}/draft/template`, {
        baseRevision: before.draft.revision - 1,
        template: { source: 'system', templateId: 'nha-khoa-uu-dai', version: 1 },
      })
      .expect(409);
    expect(problemSchema.parse(stale.body)).toMatchObject({
      code: 'revision_conflict',
      context: { currentRevision: before.draft.revision },
    });
    expect((await getPage(owner, kitchen.id, pageId)).draft).toEqual(before.draft);

    const applied = pageDetailResponseSchema.parse(
      (
        await owner
          .post(`/sites/${kitchen.id}/pages/${pageId}/draft/template`, {
            baseRevision: before.draft.revision,
            template: { source: 'system', templateId: 'nha-khoa-uu-dai', version: 1 },
          })
          .expect(200)
      ).body,
    );
    expect(applied.draft.composition.sections.map((section) => section.type)).toEqual(
      findSystemTemplate('nha-khoa-uu-dai')?.sections.map((section) => section.type),
    );
    expect(applied.draft).toMatchObject({
      slug: before.draft.slug,
      seo: before.draft.seo,
      revision: before.draft.revision + 1,
    });
    expect(applied.page).toMatchObject({
      title: before.page.title,
      liveRelease: before.page.liveRelease,
      status: { kind: 'live_with_changes' },
    });
    const activity = activityListResponseSchema.parse(
      (await owner.get(`/sites/${kitchen.id}/activity`).expect(200)).body,
    );
    expect(activity.items[0]).toMatchObject({
      type: 'page.template_applied',
      page: { id: pageId },
      data: { template: 'Ưu đãi dịch vụ nha khoa', version: 1 },
    });

    // A workspace template's photo comes as a copy in this site.
    const { pageId: photoPage } = await pageWithPhoto(owner, smile);
    const saved = await saveTemplate(owner, saveBody(smile.id, photoPage));
    const withPhoto = pageDetailResponseSchema.parse(
      (
        await owner
          .post(`/sites/${kitchen.id}/pages/${pageId}/draft/template`, {
            baseRevision: applied.draft.revision,
            template: { source: 'workspace', templateId: saved.id, version: 1 },
          })
          .expect(200)
      ).body,
    );
    const stored = await storedAsset(kitchen.id, imageOf(withPhoto));
    expect(stored?.['storageKey']).toMatch(new RegExp(`^public/${workspaceId}/${kitchen.id}/`));
  });

  it('makes a template ready for the editor without saving the draft', async () => {
    const { pageId } = await pageWithPhoto(owner, smile);
    const saved = await saveTemplate(owner, saveBody(smile.id, pageId));
    const target = await createPage(owner, spa.id);
    const response = templateCompositionResponseSchema.parse(
      (
        await owner
          .post(`/sites/${spa.id}/pages/${target.page.id}/template-composition`, {
            source: 'workspace',
            templateId: saved.id,
            version: 1,
          })
          .expect(200)
      ).body,
    );
    expect(response.template).toEqual({ name: 'Tư vấn niềng răng trả góp', version: 1 });
    const source = await detail(owner, saved.id);
    expect(response.composition.sections[0]?.id).not.toBe(source.composition.sections[0]?.id);
    const image = getAtPath(response.composition.sections[0]?.content, 'image.assetId');
    expect(response.assets.map((asset) => asset.id)).toEqual([image]);
    expect(response.assets[0]?.siteId).toBe(spa.id);
    // The draft is the editor's to change: nothing was saved.
    expect((await getPage(owner, spa.id, target.page.id)).draft).toEqual(target.draft);

    const old = await owner
      .post(`/sites/${spa.id}/pages/${target.page.id}/template-composition`, {
        source: 'system',
        templateId: 'nha-khoa-uu-dai',
        version: 2,
      })
      .expect(409);
    expect(problemSchema.parse(old.body).code).toBe('template_changed');
  });
});
