import { rmSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  activityListResponseSchema,
  type CreatePageRequest,
  type MarketplaceCatalog,
  marketplaceLicenceListResponseSchema,
  type PageDetailResponse,
  pageCountResponseSchema,
  pageDetailResponseSchema,
  problemSchema,
  type Site,
  type TemplateDetail,
  templateCompositionResponseSchema,
  templateDetailSchema,
  type TemplateListResponse,
  templateListResponseSchema,
  type TemplateRef,
  workspaceTemplateSchema,
} from '@plp/contracts';
import { getAtPath, systemTemplates } from '@plp/sections/schema';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { setReadOnly } from '../../../test/billing.js';
import { signedUpClient, signupInput, TestClient } from '../../../test/client.js';
import {
  claimFreeItem,
  DRAFT_ITEM_ID,
  FREE_ITEM_ID,
  grantLicence,
  licenceVersionPath,
  marketplaceCatalogFile,
  PAID_ITEM_ID,
  testMarketplaceCatalog,
  TWO_VERSIONS_ITEM_ID,
  V2_HEADING,
  WITHDRAWN_ITEM_ID,
} from '../../../test/marketplace.js';
import { getPage, publish, uniqueSlug } from '../../../test/pages.js';
import { configurePrivacy } from '../../../test/privacy.js';
import { addConfirmedRecipient } from '../../../test/recipients.js';
import { addMember, createSite } from '../../../test/resources.js';

const TWO_VERSIONS_NAME = 'Mẫu có hai phiên bản';

function ref(templateId: string, version: number): TemplateRef {
  return { source: 'marketplace', templateId, version };
}

function fromItem(templateId: string, version: number, title = 'Khai trương chi nhánh mới') {
  return {
    title,
    slug: uniqueSlug('mp'),
    start: { kind: 'template', source: 'marketplace', templateId, version },
  } satisfies CreatePageRequest;
}

function heroHeading(composition: { sections: { type: string; content: unknown }[] }): unknown {
  const hero = composition.sections.find((section) => section.type === 'hero');
  return hero === undefined ? undefined : getAtPath(hero.content, 'heading');
}

function expectNoTemplate(response: { status: number; body: unknown }): void {
  expect(response.status).toBe(404);
  expect(problemSchema.parse(response.body)).toMatchObject({
    code: 'not_found',
    title: 'Không tìm thấy mẫu',
  });
}

function expectChanged(response: { status: number; body: unknown }, licenceVersion: number): void {
  expect(response.status).toBe(409);
  expect(problemSchema.parse(response.body)).toMatchObject({
    code: 'template_changed',
    title: `Mẫu “${TWO_VERSIONS_NAME}” đã có phiên bản mới (v${licenceVersion})`,
    context: { currentVersion: licenceVersion },
  });
}

async function library(client: TestClient, workspaceId: string): Promise<TemplateListResponse> {
  const response = await client.get(`/workspaces/${workspaceId}/templates`).expect(200);
  return templateListResponseSchema.parse(response.body);
}

async function detail(
  client: TestClient,
  workspaceId: string,
  templateId: string,
  query = '',
): Promise<TemplateDetail> {
  const response = await client
    .get(`/workspaces/${workspaceId}/templates/${templateId}${query}`)
    .expect(200);
  return templateDetailSchema.parse(response.body);
}

async function createFromItem(
  client: TestClient,
  siteId: string,
  templateId: string,
  version: number,
): Promise<PageDetailResponse> {
  const response = await client
    .post(`/sites/${siteId}/pages`, fromItem(templateId, version))
    .expect(201);
  return pageDetailResponseSchema.parse(response.body);
}

async function licenceRows(client: TestClient, workspaceId: string) {
  const response = await client.get(`/workspaces/${workspaceId}/marketplace/licences`).expect(200);
  return marketplaceLicenceListResponseSchema.parse(response.body).items;
}

/**
 * Marketplace items in the template library, board 18, creating a page and applying a template
 * (ADR-036, amending ADR-030): every member sees the items held and those on sale, but only a
 * workspace holding an item's licence previews it there and makes pages and drafts from it, at the
 * licence's version. Another workspace's licence is never used.
 */
describe('marketplace templates', () => {
  let t: TestApp;
  const catalogFile = marketplaceCatalogFile(testMarketplaceCatalog());

  beforeAll(async () => {
    t = await createTestApp('plp_test_mp_templates', {
      env: { MARKETPLACE_CATALOG_FILE: catalogFile },
    });
  });

  afterAll(async () => {
    await t.close();
    rmSync(dirname(catalogFile), { recursive: true, force: true });
  });

  /** A workspace of its own for each test, with a site and a v1 licence of the item released twice. */
  async function workspace(): Promise<{
    owner: TestClient;
    ownerId: string;
    workspaceId: string;
    site: Site;
  }> {
    const { client, me, workspaceId } = await signedUpClient(t.app);
    const site = await createSite(client, workspaceId);
    await grantLicence(t, workspaceId, TWO_VERSIONS_ITEM_ID, { version: 1, grantedBy: me.user.id });
    return { owner: client, ownerId: me.user.id, workspaceId, site };
  }

  async function pageCount(client: TestClient, siteId: string): Promise<number> {
    const response = await client.get(`/sites/${siteId}/page-count`).expect(200);
    return pageCountResponseSchema.parse(response.body).count;
  }

  describe('the library', () => {
    it('lists the items held at their licence’s version, withdrawn ones too, then those on sale', async () => {
      const { owner, ownerId, workspaceId, site } = await workspace();
      await grantLicence(t, workspaceId, WITHDRAWN_ITEM_ID, { version: 1, grantedBy: ownerId });
      await claimFreeItem(owner, workspaceId);
      const viewer = await addMember(t, workspaceId, 'viewer', [site.id]);

      for (const client of [owner, viewer.client]) {
        const { items } = await library(client, workspaceId);
        expect(
          items.slice(0, systemTemplates.length).every((item) => item.source === 'system'),
        ).toBe(true);
        const marketplace = items.slice(systemTemplates.length);
        expect(
          marketplace.map(({ id, source, version, marketplace: info }) => [
            id,
            source,
            version,
            info,
          ]),
        ).toEqual([
          // Held, the newest licence first.
          [FREE_ITEM_ID, 'marketplace', 1, { owned: true, price: 0 }],
          [WITHDRAWN_ITEM_ID, 'marketplace', 1, { owned: true, price: 399_000 }],
          // At v1, the licence's version, though the catalog has v2.
          [TWO_VERSIONS_ITEM_ID, 'marketplace', 1, { owned: true, price: 150_000 }],
          // On sale and not held, in the catalog's order.
          [PAID_ITEM_ID, 'marketplace', 1, { owned: false, price: 399_000 }],
          ['mp-mo-ban-du-an-can-ho', 'marketplace', 1, { owned: false, price: 499_000 }],
          ['mp-spa-uu-dai-ngay-le', 'marketplace', 1, { owned: false, price: 299_000 }],
        ]);
        // A licence covers every site of the workspace, so the cards name none.
        expect(marketplace.every((item) => item.siteIds === null)).toBe(true);
        expect(marketplace.map((item) => item.id)).not.toContain(DRAFT_ITEM_ID);
      }
    });

    it('shows another workspace the items on sale only, at their current version', async () => {
      const a = await workspace();
      await grantLicence(t, a.workspaceId, WITHDRAWN_ITEM_ID, { version: 1, grantedBy: a.ownerId });
      const b = await signedUpClient(t.app);
      const marketplace = (await library(b.client, b.workspaceId)).items.filter(
        (item) => item.source === 'marketplace',
      );
      expect(marketplace.every((item) => item.marketplace?.owned === false)).toBe(true);
      expect(marketplace.map((item) => item.id)).not.toContain(WITHDRAWN_ITEM_ID);
      expect(marketplace.find((item) => item.id === TWO_VERSIONS_ITEM_ID)?.version).toBe(2);
    });
  });

  describe('board 18', () => {
    it('previews an item held at its licence’s version, for every member', async () => {
      const { owner, workspaceId, site } = await workspace();
      const viewer = await addMember(t, workspaceId, 'viewer', [site.id]);
      for (const client of [owner, viewer.client]) {
        const shown = await detail(client, workspaceId, TWO_VERSIONS_ITEM_ID);
        expect(shown).toMatchObject({
          id: TWO_VERSIONS_ITEM_ID,
          source: 'marketplace',
          name: TWO_VERSIONS_NAME,
          version: 1,
          currentVersion: 1,
          archived: false,
          marketplace: { owned: true, price: 150_000 },
          siteIds: null,
          images: {},
          usedCount: 0,
          site: null,
        });
        expect(heroHeading(shown.composition)).not.toBe(V2_HEADING);
      }
      expect((await detail(owner, workspaceId, TWO_VERSIONS_ITEM_ID, '?version=1')).version).toBe(
        1,
      );
      // What a site needs for the form, as for any template.
      expect(
        (await detail(owner, workspaceId, TWO_VERSIONS_ITEM_ID, `?siteId=${site.id}`)).site,
      ).toMatchObject({ siteId: site.id, consentGaps: ['privacy', 'consent'] });
    });

    it('finds no item without the licence, at another version, a draft or an unknown id', async () => {
      const { owner, workspaceId } = await workspace();
      for (const path of [
        // On sale, but not held: it opens on the marketplace (board 31), not here.
        PAID_ITEM_ID,
        FREE_ITEM_ID,
        WITHDRAWN_ITEM_ID,
        DRAFT_ITEM_ID,
        'mp-khong-co',
        `${TWO_VERSIONS_ITEM_ID}?version=2`,
      ]) {
        expectNoTemplate(await owner.get(`/workspaces/${workspaceId}/templates/${path}`));
      }
    });

    it('shows a withdrawn item to its holder', async () => {
      const { owner, ownerId, workspaceId } = await workspace();
      await grantLicence(t, workspaceId, WITHDRAWN_ITEM_ID, { version: 1, grantedBy: ownerId });
      expect(await detail(owner, workspaceId, WITHDRAWN_ITEM_ID)).toMatchObject({
        source: 'marketplace',
        version: 1,
      });
    });
  });

  describe('creating a page', () => {
    it('copies the licence’s version with fresh section ids and records where it came from', async () => {
      const { owner, workspaceId, site } = await workspace();
      const preview = await detail(owner, workspaceId, TWO_VERSIONS_ITEM_ID);
      const created = await createFromItem(owner, site.id, TWO_VERSIONS_ITEM_ID, 1);

      expect(created.page).toMatchObject({ goal: 'event', status: { kind: 'draft' } });
      expect(created.createdFrom).toEqual(ref(TWO_VERSIONS_ITEM_ID, 1));
      const sections = created.draft.composition.sections;
      expect(sections.map(({ type, variant }) => ({ type, variant }))).toEqual(
        preview.composition.sections.map(({ type, variant }) => ({ type, variant })),
      );
      expect(heroHeading(created.draft.composition)).toBe(heroHeading(preview.composition));
      const sampleIds = new Set(preview.composition.sections.map((section) => section.id));
      expect(sections.some((section) => sampleIds.has(section.id))).toBe(false);

      // A copy: the page never points to the item, only says where it came from.
      const stored = await t
        .workspaceDb(workspaceId)
        .collection('pages')
        .findOne({ _id: new Types.ObjectId(created.page.id) });
      expect(stored?.['createdFrom']).toEqual({
        kind: 'template',
        source: 'marketplace',
        templateId: TWO_VERSIONS_ITEM_ID,
        version: 1,
      });
      expect((await getPage(owner, site.id, created.page.id)).createdFrom).toEqual(
        ref(TWO_VERSIONS_ITEM_ID, 1),
      );

      const activity = activityListResponseSchema.parse(
        (await owner.get(`/sites/${site.id}/activity`).expect(200)).body,
      );
      expect(activity.items[0]).toMatchObject({
        type: 'page.created_from_template',
        page: { id: created.page.id },
        data: { version: 1, template: TWO_VERSIONS_NAME },
      });
    });

    it('uses the licence in every site of the workspace, and a withdrawn item held', async () => {
      const { owner, ownerId, workspaceId, site } = await workspace();
      const other = await createSite(owner, workspaceId, { name: 'Chi nhánh 2' });
      await createFromItem(owner, site.id, TWO_VERSIONS_ITEM_ID, 1);
      await createFromItem(owner, other.id, TWO_VERSIONS_ITEM_ID, 1);
      await grantLicence(t, workspaceId, WITHDRAWN_ITEM_ID, { version: 1, grantedBy: ownerId });
      expect(
        (await createFromItem(owner, other.id, WITHDRAWN_ITEM_ID, 1)).createdFrom?.templateId,
      ).toBe(WITHDRAWN_ITEM_ID);
    });

    it('refuses another version than the licence’s, and an item not held, creating nothing', async () => {
      const { owner, site } = await workspace();
      const before = await pageCount(owner, site.id);
      for (const version of [2, 3]) {
        expectChanged(
          await owner.post(`/sites/${site.id}/pages`, fromItem(TWO_VERSIONS_ITEM_ID, version)),
          1,
        );
      }
      for (const itemId of [PAID_ITEM_ID, FREE_ITEM_ID, DRAFT_ITEM_ID, 'mp-khong-co']) {
        expectNoTemplate(await owner.post(`/sites/${site.id}/pages`, fromItem(itemId, 1)));
      }
      // An id that is not a marketplace item's never reaches the licences.
      await owner.post(`/sites/${site.id}/pages`, fromItem('khai-truong-phong-tap', 1)).expect(422);
      expect(await pageCount(owner, site.id)).toBe(before);
    });

    it('needs `pages.edit` on the site and a writable workspace', async () => {
      const { owner, workspaceId, site } = await workspace();
      const viewer = await addMember(t, workspaceId, 'viewer');
      expect(
        (await viewer.client.post(`/sites/${site.id}/pages`, fromItem(TWO_VERSIONS_ITEM_ID, 1)))
          .status,
      ).toBe(403);
      await setReadOnly(t, workspaceId, true);
      try {
        const refused = await owner.post(
          `/sites/${site.id}/pages`,
          fromItem(TWO_VERSIONS_ITEM_ID, 1),
        );
        expect(refused.status).toBe(402);
        expect(problemSchema.parse(refused.body).code).toBe('workspace_read_only');
        // Board 18 stays open: it changes nothing.
        await detail(owner, workspaceId, TWO_VERSIONS_ITEM_ID);
      } finally {
        await setReadOnly(t, workspaceId, false);
      }
      expect(await pageCount(owner, site.id)).toBe(0);
    });
  });

  describe('applying an item to a draft', () => {
    it('replaces the draft’s sections from board 18, at the licence’s version', async () => {
      const { owner, site } = await workspace();
      const page = pageDetailResponseSchema.parse(
        (
          await owner
            .post(`/sites/${site.id}/pages`, {
              title: 'Trang trắng',
              slug: uniqueSlug('trang'),
              start: { kind: 'blank' },
            })
            .expect(201)
        ).body,
      );
      const path = `/sites/${site.id}/pages/${page.page.id}/draft/template`;
      const baseRevision = page.draft.revision;
      expectChanged(
        await owner.post(path, { baseRevision, template: ref(TWO_VERSIONS_ITEM_ID, 2) }),
        1,
      );
      expectNoTemplate(await owner.post(path, { baseRevision, template: ref(PAID_ITEM_ID, 1) }));
      expect((await getPage(owner, site.id, page.page.id)).draft.revision).toBe(baseRevision);

      const applied = pageDetailResponseSchema.parse(
        (
          await owner
            .post(path, { baseRevision, template: ref(TWO_VERSIONS_ITEM_ID, 1) })
            .expect(200)
        ).body,
      );
      expect(applied.draft.composition.sections.length).toBeGreaterThan(0);
      expect(heroHeading(applied.draft.composition)).not.toBe(V2_HEADING);
      const activity = activityListResponseSchema.parse(
        (await owner.get(`/sites/${site.id}/activity`).expect(200)).body,
      );
      expect(activity.items[0]).toMatchObject({
        type: 'page.template_applied',
        data: { version: 1, template: TWO_VERSIONS_NAME },
      });
    });

    it('gives the editor’s “Áp dụng mẫu…” the sections, with no image to copy', async () => {
      const { owner, workspaceId, site } = await workspace();
      const page = await createFromItem(owner, site.id, TWO_VERSIONS_ITEM_ID, 1);
      const path = `/sites/${site.id}/pages/${page.page.id}/template-composition`;
      const prepared = templateCompositionResponseSchema.parse(
        (await owner.post(path, ref(TWO_VERSIONS_ITEM_ID, 1)).expect(200)).body,
      );
      expect(prepared.template).toEqual({ name: TWO_VERSIONS_NAME, version: 1 });
      expect(prepared.assets).toEqual([]);
      const pageIds = new Set(page.draft.composition.sections.map((section) => section.id));
      expect(prepared.composition.sections.some((section) => pageIds.has(section.id))).toBe(false);

      expectChanged(await owner.post(path, ref(TWO_VERSIONS_ITEM_ID, 2)), 1);
      expectNoTemplate(await owner.post(path, ref(FREE_ITEM_ID, 1)));
      await setReadOnly(t, workspaceId, true);
      try {
        expect((await owner.post(path, ref(TWO_VERSIONS_ITEM_ID, 1))).status).toBe(402);
      } finally {
        await setReadOnly(t, workspaceId, false);
      }
    });
  });

  it('keeps each workspace to its own licences: another finds none of them', async () => {
    const a = await workspace();
    const b = await signedUpClient(t.app);
    const bSite = await createSite(b.client, b.workspaceId);

    // A's licence of the item: B previews, creates and applies nothing with it.
    expectNoTemplate(
      await b.client.get(`/workspaces/${b.workspaceId}/templates/${TWO_VERSIONS_ITEM_ID}`),
    );
    expectNoTemplate(
      await b.client.post(`/sites/${bSite.id}/pages`, fromItem(TWO_VERSIONS_ITEM_ID, 1)),
    );
    const blank = pageDetailResponseSchema.parse(
      (
        await b.client
          .post(`/sites/${bSite.id}/pages`, {
            title: 'Trang trắng',
            slug: uniqueSlug('trang'),
            start: { kind: 'blank' },
          })
          .expect(201)
      ).body,
    );
    expectNoTemplate(
      await b.client.post(`/sites/${bSite.id}/pages/${blank.page.id}/draft/template`, {
        baseRevision: blank.draft.revision,
        template: ref(TWO_VERSIONS_ITEM_ID, 1),
      }),
    );
    expectNoTemplate(
      await b.client.post(
        `/sites/${bSite.id}/pages/${blank.page.id}/template-composition`,
        ref(TWO_VERSIONS_ITEM_ID, 1),
      ),
    );
    // Nor through A's workspace or sites: B is no member there.
    expect(
      (await b.client.get(`/workspaces/${a.workspaceId}/templates/${TWO_VERSIONS_ITEM_ID}`)).status,
    ).toBe(404);
    expect(
      (await b.client.post(`/sites/${a.site.id}/pages`, fromItem(TWO_VERSIONS_ITEM_ID, 1))).status,
    ).toBe(404);
    expect(await pageCount(a.owner, a.site.id)).toBe(0);
  });

  it('counts the pages made from an item in the member’s sites, on board 18 and board 32', async () => {
    const { owner, workspaceId, site } = await workspace();
    const other = await createSite(owner, workspaceId, { name: 'Chi nhánh 2' });
    await createFromItem(owner, site.id, TWO_VERSIONS_ITEM_ID, 1);
    await createFromItem(owner, site.id, TWO_VERSIONS_ITEM_ID, 1);
    await createFromItem(owner, other.id, TWO_VERSIONS_ITEM_ID, 1);
    // A system template with an id of its own never counts for the item.
    await owner
      .post(`/sites/${site.id}/pages`, {
        title: 'Ưu đãi',
        slug: uniqueSlug('mau'),
        start: {
          kind: 'template',
          source: 'system',
          templateId: 'nha-khoa-uu-dai',
          version: systemTemplates.find((item) => item.id === 'nha-khoa-uu-dai')?.version ?? 0,
        },
      })
      .expect(201);
    const kept = await addMember(t, workspaceId, 'editor', [other.id]);

    expect((await detail(owner, workspaceId, TWO_VERSIONS_ITEM_ID)).usedCount).toBe(3);
    expect((await detail(kept.client, workspaceId, TWO_VERSIONS_ITEM_ID)).usedCount).toBe(1);
    expect(
      (await licenceRows(owner, workspaceId)).find((row) => row.itemId === TWO_VERSIONS_ITEM_ID)
        ?.usedCount,
    ).toBe(3);
    expect(
      (await licenceRows(kept.client, workspaceId)).find(
        (row) => row.itemId === TWO_VERSIONS_ITEM_ID,
      )?.usedCount,
    ).toBe(1);
    await claimFreeItem(owner, workspaceId);
    expect(
      (await licenceRows(owner, workspaceId)).find((row) => row.itemId === FREE_ITEM_ID)?.usedCount,
    ).toBe(0);
  });

  it('saves a page made from an item as a template of the workspace, which stays there', async () => {
    const { owner, workspaceId, site } = await workspace();
    const page = await createFromItem(owner, site.id, TWO_VERSIONS_ITEM_ID, 1);
    const saved = workspaceTemplateSchema.parse(
      (
        await owner
          .post(`/workspaces/${workspaceId}/workspace-templates`, {
            source: { siteId: site.id, pageId: page.page.id, kind: 'draft' },
            content: 'keep',
            note: '',
            name: 'Khai trương chi nhánh',
            description: '',
            goal: 'event',
            industry: 'fitness',
            scope: { kind: 'workspace' },
          })
          .expect(201)
      ).body,
    );
    const card = (await library(owner, workspaceId)).items.find((item) => item.id === saved.id);
    expect(card).toMatchObject({ source: 'workspace', marketplace: null, version: 1 });
    const own = await detail(owner, workspaceId, saved.id);
    expect(heroHeading(own.composition)).toBe(heroHeading(page.draft.composition));

    // It is the workspace's: another workspace finds nothing at its id.
    const b = await signedUpClient(t.app);
    expectNoTemplate(await b.client.get(`/workspaces/${b.workspaceId}/templates/${saved.id}`));
  });
});

/**
 * ADR-036's version test: a page made from v1, then the catalog adds v2 (the API started again on
 * the same database with another file), the licence moves to v2, and the page made earlier keeps
 * its draft and its release while a new page carries v2.
 */
describe('a new version of an item held', () => {
  let t: TestApp;
  const files: string[] = [];
  const full: MarketplaceCatalog = testMarketplaceCatalog();

  function catalogFile(content: MarketplaceCatalog): string {
    const file = marketplaceCatalogFile(content);
    files.push(file);
    return file;
  }

  /** The test catalog before the item's v2 was released. */
  function beforeV2(): MarketplaceCatalog {
    return {
      ...full,
      items: full.items.map((item) =>
        item.id === TWO_VERSIONS_ITEM_ID ? { ...item, versions: item.versions.slice(0, 1) } : item,
      ),
    };
  }

  beforeAll(async () => {
    t = await createTestApp('plp_test_mp_template_versions', {
      env: { MARKETPLACE_CATALOG_FILE: catalogFile(beforeV2()) },
    });
  });

  afterAll(async () => {
    await t.close();
    for (const file of files) {
      rmSync(dirname(file), { recursive: true, force: true });
    }
  });

  it('never changes the pages made before; new pages carry the version updated to', async () => {
    const input = signupInput();
    const { client: owner, me, workspaceId } = await signedUpClient(t.app, input);
    const site = await createSite(owner, workspaceId);
    await configurePrivacy(owner, site.id);
    await addConfirmedRecipient(t, owner, site.id);
    await grantLicence(t, workspaceId, TWO_VERSIONS_ITEM_ID, { version: 1, grantedBy: me.user.id });
    expect(
      (await library(owner, workspaceId)).items.find((item) => item.id === TWO_VERSIONS_ITEM_ID),
    ).toMatchObject({ version: 1, marketplace: { owned: true } });

    const old = await createFromItem(owner, site.id, TWO_VERSIONS_ITEM_ID, 1);
    const live = await publish(owner, site.id, old.page.id);
    const pages = t.workspaceDb(workspaceId).collection('pages');
    const releases = t.workspaceDb(workspaceId).collection('releases');
    const pageBefore = await pages.findOne({ _id: new Types.ObjectId(old.page.id) });
    const releaseBefore = await releases.findOne({ _id: new Types.ObjectId(live.release.id) });
    expect(releaseBefore).not.toBeNull();

    // The API started again on the same database, with v2 in its catalog.
    const restarted = await createTestApp('plp_test_mp_template_versions', {
      database: t.env.MONGODB_URI,
      env: { MARKETPLACE_CATALOG_FILE: catalogFile(full) },
    });
    try {
      const client = new TestClient(restarted.app);
      await client
        .post('/auth/login', { email: input.email, password: input.password })
        .expect(200);

      // The licence stays at v1 until "Cập nhật": pages are still made from v1.
      expect(await detail(client, workspaceId, TWO_VERSIONS_ITEM_ID)).toMatchObject({
        version: 1,
        currentVersion: 1,
        usedCount: 1,
      });
      expectChanged(
        await client.post(`/sites/${site.id}/pages`, fromItem(TWO_VERSIONS_ITEM_ID, 2)),
        1,
      );
      expect(
        (await licenceRows(client, workspaceId)).find((row) => row.itemId === TWO_VERSIONS_ITEM_ID),
      ).toMatchObject({ version: 1, latestVersion: 2, usedCount: 1 });

      await client
        .post(licenceVersionPath(workspaceId, TWO_VERSIONS_ITEM_ID), { baseVersion: 1 })
        .expect(200);

      // The page made from v1 keeps its draft and its release, field for field.
      expect(await pages.findOne({ _id: new Types.ObjectId(old.page.id) })).toEqual(pageBefore);
      expect(await releases.findOne({ _id: new Types.ObjectId(live.release.id) })).toEqual(
        releaseBefore,
      );
      expect(heroHeading((await getPage(client, site.id, old.page.id)).draft.composition)).not.toBe(
        V2_HEADING,
      );

      // A new page carries v2; v1 is no longer what pages are made from.
      expectChanged(
        await client.post(`/sites/${site.id}/pages`, fromItem(TWO_VERSIONS_ITEM_ID, 1)),
        2,
      );
      const fresh = await createFromItem(client, site.id, TWO_VERSIONS_ITEM_ID, 2);
      expect(heroHeading(fresh.draft.composition)).toBe(V2_HEADING);
      expect(fresh.createdFrom).toEqual(ref(TWO_VERSIONS_ITEM_ID, 2));
      expect(await detail(client, workspaceId, TWO_VERSIONS_ITEM_ID)).toMatchObject({
        version: 2,
        currentVersion: 2,
        // "Đã dùng" counts every version.
        usedCount: 2,
      });
    } finally {
      await restarted.close();
    }
  });
});
