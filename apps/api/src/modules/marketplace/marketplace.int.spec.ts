import { rmSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  type MarketplaceCatalog,
  marketplaceItemDetailSchema,
  marketplaceListResponseSchema,
  problemSchema,
  type Role,
} from '@plp/contracts';
import { compositionOutline } from '@plp/sections/schema';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { setReadOnly } from '../../../test/billing.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import {
  DRAFT_ITEM_ID,
  marketplaceCatalogFile,
  testMarketplaceCatalog,
  TWO_VERSIONS_ITEM_ID,
  V2_HEADING,
  WITHDRAWN_ITEM_ID,
} from '../../../test/marketplace.js';
import { addMember, createSite } from '../../../test/resources.js';

const GYM_ID = 'mp-khai-truong-phong-tap';
const FREE_ID = 'mp-khoa-hoc-tieng-anh-tre-em';
const OWNER_NAME = 'Ngọc Anh';
const MEMBER_ROLES = ['admin', 'editor', 'contributor', 'support', 'viewer'] as const;

/**
 * Browsing the marketplace (ADR-036, MP1): every member of a workspace, whatever their role, lists
 * the listed items and opens one, also while the workspace is read-only. Drafts, withdrawn items
 * (no workspace holds a licence before MP2) and other workspaces' members find nothing.
 */
describe('marketplace', () => {
  let t: TestApp;
  let owner: TestClient;
  let workspaceId: string;
  let catalogFile: string;
  const catalog: MarketplaceCatalog = testMarketplaceCatalog();

  beforeAll(async () => {
    catalogFile = marketplaceCatalogFile(catalog);
    t = await createTestApp('plp_test_marketplace', {
      env: { MARKETPLACE_CATALOG_FILE: catalogFile },
    });
    ({ client: owner, workspaceId } = await signedUpClient(t.app, { name: OWNER_NAME }));
  });

  afterAll(async () => {
    await t.close();
    rmSync(dirname(catalogFile), { recursive: true, force: true });
  });

  function listPath(id = workspaceId): string {
    return `/workspaces/${id}/marketplace`;
  }

  function itemPath(itemId: string, id = workspaceId): string {
    return `/workspaces/${id}/marketplace/items/${itemId}`;
  }

  async function expectNoItem(client: TestClient, itemId: string): Promise<void> {
    const response = await client.get(itemPath(itemId)).expect(404);
    expect(problemSchema.parse(response.body)).toMatchObject({
      code: 'not_found',
      title: 'Không tìm thấy mẫu',
    });
  }

  it('lists every listed item at its current version, in the catalog’s order', async () => {
    const response = await owner.get(listPath()).expect(200);
    const { items, ownedCount } = marketplaceListResponseSchema.parse(response.body);
    expect(items.map((item) => item.id)).toEqual([
      GYM_ID,
      'mp-mo-ban-du-an-can-ho',
      'mp-spa-uu-dai-ngay-le',
      FREE_ID,
      TWO_VERSIONS_ITEM_ID,
    ]);
    // No workspace holds a licence before MP2: nothing owned, every item equally used.
    expect(ownedCount).toBe(0);
    expect(new Set(items.map((item) => item.owned))).toEqual(new Set([false]));
    expect(new Set(items.map((item) => item.popularRank))).toEqual(new Set([1]));
    expect(items[0]).toMatchObject({
      name: 'Khai trương phòng tập',
      goal: 'event',
      industry: 'fitness',
      price: 399_000,
      version: 1,
      releasedOn: '2026-11-21',
      hasForm: true,
    });
    expect(items.find((item) => item.id === FREE_ID)?.price).toBe(0);
    const twice = items.find((item) => item.id === TWO_VERSIONS_ITEM_ID);
    expect(twice).toMatchObject({ version: 2, releasedOn: '2026-10-20', price: 150_000 });
    expect(twice?.sections.find((section) => section.type === 'hero')?.label).toBe(
      `Hero · “${V2_HEADING}”`,
    );
  });

  it('details an item: the current version to preview, its note, the terms, the owner', async () => {
    const response = await owner.get(itemPath(TWO_VERSIONS_ITEM_ID)).expect(200);
    const detail = marketplaceItemDetailSchema.parse(response.body);
    const current = catalog.items.find((item) => item.id === TWO_VERSIONS_ITEM_ID)?.versions[1];
    expect(detail).toMatchObject({
      id: TWO_VERSIONS_ITEM_ID,
      version: 2,
      note: 'Đổi tiêu đề của Hero.',
      terms: catalog.terms,
      withdrawn: false,
      licence: null,
      owned: false,
      popularRank: 1,
      ownerName: OWNER_NAME,
    });
    expect(detail.composition).toEqual(current?.composition);
    expect(detail.sections).toEqual(compositionOutline(detail.composition));
  });

  it('shows the list and every item to each role, naming the workspace’s owner', async () => {
    const site = await createSite(owner, workspaceId);
    const members: { role: Role | 'kept to a site'; client: TestClient }[] = [
      { role: 'owner', client: owner },
    ];
    for (const role of MEMBER_ROLES) {
      members.push({ role, client: (await addMember(t, workspaceId, role)).client });
    }
    members.push({
      role: 'kept to a site',
      client: (await addMember(t, workspaceId, 'editor', [site.id])).client,
    });
    for (const { role, client } of members) {
      const list = marketplaceListResponseSchema.parse(
        (await client.get(listPath()).expect(200)).body,
      );
      expect(list.items, role).toHaveLength(5);
      for (const item of list.items) {
        const response = await client.get(itemPath(item.id));
        expect(response.status, `${role} ${item.id}`).toBe(200);
        expect(marketplaceItemDetailSchema.parse(response.body).ownerName, role).toBe(OWNER_NAME);
      }
    }
  });

  it('finds no draft, no withdrawn item without a licence, and no id outside the catalog', async () => {
    for (const itemId of [
      DRAFT_ITEM_ID,
      WITHDRAWN_ITEM_ID,
      'mp-khong-co-mau-nay',
      'nha-khoa-uu-dai',
      new Types.ObjectId().toHexString(),
      'MP-KHAI-TRUONG-PHONG-TAP',
    ]) {
      await expectNoItem(owner, itemId);
    }
    const viewer = (await addMember(t, workspaceId, 'viewer')).client;
    await expectNoItem(viewer, DRAFT_ITEM_ID);
    await expectNoItem(viewer, WITHDRAWN_ITEM_ID);
  });

  it('answers 404 outside the workspace and 401 without a session', async () => {
    const stranger = await signedUpClient(t.app);
    for (const path of [listPath(), itemPath(GYM_ID), itemPath(DRAFT_ITEM_ID)]) {
      const response = await stranger.client.get(path).expect(404);
      expect(problemSchema.parse(response.body).title).toBe('Không tìm thấy workspace');
      await request(t.app.getHttpServer()).get(path).expect(401);
    }
    await owner.get(listPath('not-an-id')).expect(404);
    await owner.get(itemPath(GYM_ID, new Types.ObjectId().toHexString())).expect(404);
    // The stranger's own workspace browses the same catalog.
    await stranger.client.get(itemPath(GYM_ID, stranger.workspaceId)).expect(200);
  });

  it('stays open to a read-only workspace: browsing changes nothing', async () => {
    const viewer = (await addMember(t, workspaceId, 'viewer')).client;
    await setReadOnly(t, workspaceId, true);
    try {
      for (const client of [owner, viewer]) {
        await client.get(listPath()).expect(200);
        await client.get(itemPath(FREE_ID)).expect(200);
        await client.get(itemPath(GYM_ID)).expect(200);
      }
    } finally {
      await setReadOnly(t, workspaceId, false);
    }
  });
});

describe('the marketplace catalog at startup', () => {
  const files: string[] = [];

  afterAll(() => {
    for (const file of files) {
      rmSync(dirname(file), { recursive: true, force: true });
    }
  });

  /** Starts the API on `content` as its catalog; it must refuse with `message`. */
  async function expectRefused(content: unknown, message: RegExp): Promise<void> {
    const file = marketplaceCatalogFile(content);
    files.push(file);
    // A refused start leaves the connections it opened before the catalog was read: close them.
    const before = new Set(mongoose.connections);
    try {
      await expect(
        createTestApp('plp_test_marketplace_refused', { env: { MARKETPLACE_CATALOG_FILE: file } }),
      ).rejects.toThrow(message);
    } finally {
      await Promise.all(
        mongoose.connections
          .filter((connection) => !before.has(connection))
          .map((connection) => connection.close()),
      );
    }
  }

  it('does not start on a file that is not a catalog', async () => {
    await expectRefused('{ "terms": ', /Invalid marketplace catalog .* cannot be read as JSON/);
    const catalog = testMarketplaceCatalog();
    await expectRefused(
      { ...catalog, items: [...catalog.items, catalog.items[0]] },
      /Invalid marketplace catalog[\s\S]*Mã mẫu bị trùng/,
    );
  });

  it('does not start on a composition with an image or a link to another page', async () => {
    const catalog = testMarketplaceCatalog();
    const [first, ...rest] = catalog.items;
    const v1 = first?.versions[0];
    if (first === undefined || v1 === undefined) {
      throw new Error('The test catalog has no item');
    }
    const sections = v1.composition.sections.map((section) =>
      section.type === 'navbar'
        ? {
            ...section,
            content: {
              ...section.content,
              cta: {
                label: 'Giữ chỗ',
                link: { kind: 'page', pageId: new Types.ObjectId().toHexString() },
              },
            },
          }
        : section,
    );
    await expectRefused(
      {
        ...catalog,
        items: [
          { ...first, versions: [{ ...v1, composition: { ...v1.composition, sections } }] },
          ...rest,
        ],
      },
      /✖ mp-khai-truong-phong-tap v1: sections\.0\.content\.cta: links to a page/,
    );
  });
});
