import { rmSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  type MarketplaceCatalog,
  type MarketplaceItem,
  type MarketplaceItemVersion,
  marketplaceItemDetailSchema,
  marketplaceLicenceListResponseSchema,
  marketplaceLicenceSchema,
  marketplaceListResponseSchema,
  problemSchema,
} from '@plp/contracts';
import { compositionOutline } from '@plp/sections/schema';
import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { setReadOnly } from '../../../test/billing.js';
import { signedUpClient, signupInput, TestClient } from '../../../test/client.js';
import {
  claimFreeItem,
  claimPath,
  DRAFT_ITEM_ID,
  FREE_ITEM_ID,
  grantLicence,
  licenceVersionPath,
  marketplaceCatalogFile,
  PAID_ITEM_ID,
  testMarketplaceCatalog,
  TWO_VERSIONS_ITEM_ID,
  WITHDRAWN_ITEM_ID,
} from '../../../test/marketplace.js';
import { addMember, scopeOf } from '../../../test/resources.js';
import { versionHashOf } from './domain/version-hash.js';
import { MarketplaceLicencesRepository } from './marketplace-licences.repository.js';

/** Released three times: a licence may stand between its first and its current version. */
const THREE_VERSIONS_ID = 'mp-mau-ba-phien-ban';
/** No longer sold, with a version after the first: its holders still update to it. */
const WITHDRAWN_TWICE_ID = 'mp-mau-ngung-ban-hai-phien-ban';
const SEEN = { version: 1, termsVersion: 1 };

function itemIn(catalog: MarketplaceCatalog, id: string): MarketplaceItem {
  const item = catalog.items.find((candidate) => candidate.id === id);
  if (item === undefined) {
    throw new Error(`No item "${id}"`);
  }
  return item;
}

function versionIn(
  catalog: MarketplaceCatalog,
  id: string,
  version: number,
): MarketplaceItemVersion {
  const found = itemIn(catalog, id).versions.find((candidate) => candidate.version === version);
  if (found === undefined) {
    throw new Error(`No ${id} v${version}`);
  }
  return found;
}

/** The test catalog with an item released three times and a withdrawn one released twice. */
function licenceCatalog(): MarketplaceCatalog {
  const catalog = testMarketplaceCatalog();
  const twice = itemIn(catalog, TWO_VERSIONS_ITEM_ID);
  const v1 = versionIn(catalog, TWO_VERSIONS_ITEM_ID, 1);
  return {
    ...catalog,
    items: [
      ...catalog.items,
      {
        ...twice,
        id: THREE_VERSIONS_ID,
        name: 'Mẫu có ba phiên bản',
        versions: [
          ...twice.versions,
          { ...v1, version: 3, releasedOn: '2026-11-01', note: 'Trở lại tiêu đề cũ.' },
        ],
      },
      { ...twice, id: WITHDRAWN_TWICE_ID, status: 'withdrawn', name: 'Mẫu ngừng bán hai bản' },
    ],
  };
}

/**
 * The licences of the workspaces (ADR-036, MP2): "Nhận mẫu" of a free item, board 32 and "Cập
 * nhật", with board 30 and 31 saying what the workspace holds. A licence is the workspace's
 * alone: another workspace neither sees nor changes it.
 */
describe('marketplace licences', () => {
  let t: TestApp;
  let catalogFile: string;
  const catalog = licenceCatalog();

  beforeAll(async () => {
    catalogFile = marketplaceCatalogFile(catalog);
    t = await createTestApp('plp_test_mp_licences', {
      env: { MARKETPLACE_CATALOG_FILE: catalogFile },
    });
  });

  afterAll(async () => {
    await t.close();
    rmSync(dirname(catalogFile), { recursive: true, force: true });
  });

  /** A workspace of its own for each test, and its owner. */
  async function workspace(): Promise<{ owner: TestClient; ownerId: string; workspaceId: string }> {
    const { client, me, workspaceId } = await signedUpClient(t.app);
    return { owner: client, ownerId: me.user.id, workspaceId };
  }

  /** The stored licences of the workspace, every field. */
  function storedLicences(workspaceId: string) {
    return t.connection
      .collection('marketplace_licences')
      .find({ workspaceId: new Types.ObjectId(workspaceId) })
      .sort({ _id: 1 })
      .toArray();
  }

  async function licenceList(client: TestClient, workspaceId: string) {
    const response = await client.get(`/workspaces/${workspaceId}/marketplace/licences`);
    expect(response.status).toBe(200);
    return marketplaceLicenceListResponseSchema.parse(response.body).items;
  }

  function expectNoItem(response: { status: number; body: unknown }): void {
    expect(response.status).toBe(404);
    expect(problemSchema.parse(response.body)).toMatchObject({
      code: 'not_found',
      title: 'Không tìm thấy mẫu',
    });
  }

  describe('"Nhận mẫu"', () => {
    it('grants a free licence at the version and terms agreed: no invoice, no email', async () => {
      const { owner, workspaceId } = await workspace();
      const editor = await addMember(t, workspaceId, 'editor');
      const sentBefore = t.emails.sent.length;

      const response = await editor.client
        .post(claimPath(workspaceId, FREE_ITEM_ID), SEEN)
        .expect(200);
      const licence = marketplaceLicenceSchema.parse(response.body);
      expect(licence).toMatchObject({ source: 'free', version: 1, termsVersion: 1 });

      const stored = await storedLicences(workspaceId);
      expect(stored).toEqual([
        {
          _id: expect.any(Types.ObjectId) as Types.ObjectId,
          workspaceId: new Types.ObjectId(workspaceId),
          itemId: FREE_ITEM_ID,
          source: 'free',
          version: 1,
          versionHash: versionHashOf(versionIn(catalog, FREE_ITEM_ID, 1).composition),
          invoiceId: null,
          termsVersion: 1,
          grantedAt: new Date(licence.grantedAt),
          grantedBy: new Types.ObjectId(editor.me.user.id),
          updatedAt: new Date(licence.grantedAt),
          updatedBy: new Types.ObjectId(editor.me.user.id),
        },
      ]);
      expect(
        await t.connection
          .collection('invoices')
          .countDocuments({ workspaceId: new Types.ObjectId(workspaceId) }),
      ).toBe(0);
      expect(t.emails.sent).toHaveLength(sentBefore);

      // Boards 30 and 31 say the workspace holds it.
      const list = marketplaceListResponseSchema.parse(
        (await owner.get(`/workspaces/${workspaceId}/marketplace`).expect(200)).body,
      );
      expect(list.ownedCount).toBe(1);
      expect(list.items.filter((item) => item.owned).map((item) => item.id)).toEqual([
        FREE_ITEM_ID,
      ]);
      const detail = marketplaceItemDetailSchema.parse(
        (
          await owner
            .get(`/workspaces/${workspaceId}/marketplace/items/${FREE_ITEM_ID}`)
            .expect(200)
        ).body,
      );
      expect(detail).toMatchObject({ owned: true, licence });
    });

    it('answers a claim of an item held with that licence, changing nothing', async () => {
      const { owner, workspaceId } = await workspace();
      const first = await claimFreeItem(owner, workspaceId);
      const before = await storedLicences(workspaceId);
      // Whatever the member saw: the licence held answers before the item's version and terms.
      for (const body of [SEEN, { version: 7, termsVersion: 3 }]) {
        const again = await owner.post(claimPath(workspaceId, FREE_ITEM_ID), body).expect(200);
        expect(marketplaceLicenceSchema.parse(again.body)).toEqual(first);
      }
      // A paid item the workspace holds (a purchase, MP3) answers the same way.
      const { me } = await addMember(t, workspaceId, 'admin');
      await grantLicence(t, workspaceId, PAID_ITEM_ID, { version: 1, grantedBy: me.user.id });
      const paid = await owner.post(claimPath(workspaceId, PAID_ITEM_ID), SEEN).expect(200);
      expect(marketplaceLicenceSchema.parse(paid.body)).toMatchObject({ source: 'purchase' });
      expect((await storedLicences(workspaceId)).slice(0, 1)).toEqual(before);
    });

    it('makes one licence of claims sent at once', async () => {
      const { owner, workspaceId } = await workspace();
      const admin = await addMember(t, workspaceId, 'admin');
      const responses = await Promise.all(
        Array.from({ length: 6 }, (_, index) =>
          (index % 2 === 0 ? owner : admin.client).post(claimPath(workspaceId, FREE_ITEM_ID), SEEN),
        ),
      );
      expect(responses.map((response) => response.status)).toEqual(
        Array.from({ length: 6 }, () => 200),
      );
      const licences = responses.map((response) => marketplaceLicenceSchema.parse(response.body));
      expect(new Set(licences.map((licence) => licence.grantedAt)).size).toBe(1);
      expect(await storedLicences(workspaceId)).toHaveLength(1);
    });

    it('refuses an item with a price: 409 item_not_free, and grants nothing', async () => {
      const { owner, workspaceId } = await workspace();
      for (const [itemId, price] of [
        [PAID_ITEM_ID, 399_000],
        [TWO_VERSIONS_ITEM_ID, 150_000],
      ] as const) {
        const response = await owner
          .post(claimPath(workspaceId, itemId), { version: 1, termsVersion: 1 })
          .expect(409);
        expect(problemSchema.parse(response.body)).toMatchObject({
          code: 'item_not_free',
          context: { price },
        });
      }
      expect(await storedLicences(workspaceId)).toEqual([]);
    });

    it('refuses another version or other terms than now: 409 item_changed with them', async () => {
      const { owner, workspaceId } = await workspace();
      for (const body of [
        { version: 2, termsVersion: 1 },
        { version: 1, termsVersion: 2 },
      ]) {
        const response = await owner.post(claimPath(workspaceId, FREE_ITEM_ID), body).expect(409);
        expect(problemSchema.parse(response.body)).toMatchObject({
          code: 'item_changed',
          context: { version: 1, price: 0, termsVersion: 1 },
        });
      }
      expect(await storedLicences(workspaceId)).toEqual([]);
    });

    it('finds no draft, no withdrawn item it does not hold, and nothing outside the catalog', async () => {
      const { owner, workspaceId } = await workspace();
      for (const itemId of [
        DRAFT_ITEM_ID,
        WITHDRAWN_ITEM_ID,
        'mp-khong-co-mau-nay',
        'nha-khoa-uu-dai',
        new Types.ObjectId().toHexString(),
      ]) {
        expectNoItem(await owner.post(claimPath(workspaceId, itemId), SEEN));
      }
      await owner
        .post(claimPath(workspaceId, FREE_ITEM_ID), { version: 'v1', termsVersion: 1 })
        .expect(422);
      expect(await storedLicences(workspaceId)).toEqual([]);
    });
  });

  describe('board 32', () => {
    it('lists every licence, the newest first, with the notes of the versions after it', async () => {
      const { owner, ownerId, workspaceId } = await workspace();
      await grantLicence(t, workspaceId, TWO_VERSIONS_ITEM_ID, { version: 1, grantedBy: ownerId });
      await claimFreeItem(owner, workspaceId);
      await grantLicence(t, workspaceId, WITHDRAWN_ITEM_ID, { version: 1, grantedBy: ownerId });
      const viewer = await addMember(t, workspaceId, 'viewer');

      const rows = await licenceList(viewer.client, workspaceId);
      expect(rows.map((row) => row.itemId)).toEqual([
        WITHDRAWN_ITEM_ID,
        FREE_ITEM_ID,
        TWO_VERSIONS_ITEM_ID,
      ]);
      const v1 = versionIn(catalog, TWO_VERSIONS_ITEM_ID, 1);
      expect(rows[2]).toEqual({
        itemId: TWO_VERSIONS_ITEM_ID,
        name: 'Mẫu có hai phiên bản',
        source: 'purchase',
        version: 1,
        latestVersion: 2,
        newVersions: [{ version: 2, releasedOn: '2026-10-20', note: 'Đổi tiêu đề của Hero.' }],
        grantedAt: expect.any(String) as string,
        withdrawn: false,
        hasForm: true,
        sections: compositionOutline(v1.composition),
        // No page made from it yet: "0 trang đã tạo từ mẫu này không đổi".
        usedCount: 0,
      });
      expect(rows[1]).toMatchObject({ source: 'free', version: 1, newVersions: [] });
      expect(rows[0]).toMatchObject({ withdrawn: true, name: 'Mẫu ngừng bán' });

      // Board 30 counts the withdrawn item but does not list it; board 31 shows it to its holder.
      const list = marketplaceListResponseSchema.parse(
        (await owner.get(`/workspaces/${workspaceId}/marketplace`).expect(200)).body,
      );
      expect(list.ownedCount).toBe(3);
      expect(list.items.map((item) => item.id)).not.toContain(WITHDRAWN_ITEM_ID);
      const withdrawn = marketplaceItemDetailSchema.parse(
        (
          await viewer.client
            .get(`/workspaces/${workspaceId}/marketplace/items/${WITHDRAWN_ITEM_ID}`)
            .expect(200)
        ).body,
      );
      expect(withdrawn).toMatchObject({ withdrawn: true, owned: true, licence: { version: 1 } });
    });

    it('is empty for a workspace that holds nothing', async () => {
      const { owner, workspaceId } = await workspace();
      expect(await licenceList(owner, workspaceId)).toEqual([]);
    });
  });

  describe('"Cập nhật"', () => {
    it('moves the licence to the current version, once', async () => {
      const { owner, ownerId, workspaceId } = await workspace();
      await grantLicence(t, workspaceId, TWO_VERSIONS_ITEM_ID, { version: 1, grantedBy: ownerId });
      const [granted] = await storedLicences(workspaceId);
      const [row] = await licenceList(owner, workspaceId);
      const admin = await addMember(t, workspaceId, 'admin');

      const response = await admin.client
        .post(licenceVersionPath(workspaceId, TWO_VERSIONS_ITEM_ID), { baseVersion: 1 })
        .expect(200);
      expect(marketplaceLicenceSchema.parse(response.body)).toEqual({
        source: 'purchase',
        version: 2,
        termsVersion: 1,
        grantedAt: row?.grantedAt,
      });
      const [moved] = await storedLicences(workspaceId);
      expect(moved).toEqual({
        ...granted,
        version: 2,
        versionHash: versionHashOf(versionIn(catalog, TWO_VERSIONS_ITEM_ID, 2).composition),
        updatedAt: expect.any(Date) as Date,
        updatedBy: new Types.ObjectId(admin.me.user.id),
      });
      expect(await licenceList(owner, workspaceId)).toMatchObject([
        { itemId: TWO_VERSIONS_ITEM_ID, version: 2, latestVersion: 2, newVersions: [] },
      ]);

      // At the current version: unchanged, from whichever version the member saw.
      for (const baseVersion of [1, 2]) {
        const again = await owner
          .post(licenceVersionPath(workspaceId, TWO_VERSIONS_ITEM_ID), { baseVersion })
          .expect(200);
        expect(marketplaceLicenceSchema.parse(again.body).version).toBe(2);
      }
      expect(await storedLicences(workspaceId)).toEqual([moved]);
    });

    it('refuses a licence no longer at the version seen: 409 template_changed with it', async () => {
      const { owner, ownerId, workspaceId } = await workspace();
      // Another member moved it to v2 after this one read the notes from v1; v3 is current.
      await grantLicence(t, workspaceId, THREE_VERSIONS_ID, { version: 2, grantedBy: ownerId });
      await grantLicence(t, workspaceId, TWO_VERSIONS_ITEM_ID, { version: 1, grantedBy: ownerId });
      const before = await storedLicences(workspaceId);
      for (const [itemId, baseVersion, currentVersion] of [
        [THREE_VERSIONS_ID, 1, 2],
        [TWO_VERSIONS_ITEM_ID, 2, 1],
      ] as const) {
        const response = await owner
          .post(licenceVersionPath(workspaceId, itemId), { baseVersion })
          .expect(409);
        expect(problemSchema.parse(response.body)).toMatchObject({
          code: 'template_changed',
          context: { currentVersion },
        });
      }
      expect(await storedLicences(workspaceId)).toEqual(before);
      expect(await licenceList(owner, workspaceId)).toMatchObject([
        { itemId: TWO_VERSIONS_ITEM_ID },
        {
          itemId: THREE_VERSIONS_ID,
          version: 2,
          latestVersion: 3,
          newVersions: [{ version: 3, note: 'Trở lại tiêu đề cũ.' }],
        },
      ]);
    });

    it('makes one move of updates sent at once', async () => {
      const { owner, ownerId, workspaceId } = await workspace();
      await grantLicence(t, workspaceId, THREE_VERSIONS_ID, { version: 1, grantedBy: ownerId });
      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          owner.post(licenceVersionPath(workspaceId, THREE_VERSIONS_ID), { baseVersion: 1 }),
        ),
      );
      expect(responses.map((response) => response.status)).toEqual(
        Array.from({ length: 5 }, () => 200),
      );
      expect(
        responses.map((response) => marketplaceLicenceSchema.parse(response.body).version),
      ).toEqual(Array.from({ length: 5 }, () => 3));
      expect(await storedLicences(workspaceId)).toMatchObject([{ version: 3 }]);
    });

    it('moves a licence only from the version it is still at, never back', async () => {
      // Two API instances during a deploy: one serves a catalog where v3 is current, the other
      // still one where v2 is. Both read the licence at v1; the second write must not undo the first.
      const { ownerId, workspaceId } = await workspace();
      await grantLicence(t, workspaceId, THREE_VERSIONS_ID, { version: 1, grantedBy: ownerId });
      const admin = await addMember(t, workspaceId, 'admin');
      const editor = await addMember(t, workspaceId, 'editor');
      const repository = t.app.get(MarketplaceLicencesRepository);
      const v2Hash = versionHashOf(versionIn(catalog, THREE_VERSIONS_ID, 2).composition);
      const v3Hash = versionHashOf(versionIn(catalog, THREE_VERSIONS_ID, 3).composition);

      const first = await repository.moveVersion(
        await scopeOf(t, admin.me, workspaceId),
        THREE_VERSIONS_ID,
        { from: 1, to: 3, versionHash: v3Hash, at: new Date('2026-11-21T08:00:00.000Z') },
      );
      expect(first).toMatchObject({ version: 3, versionHash: v3Hash });
      const [moved] = await storedLicences(workspaceId);
      expect(moved).toMatchObject({
        version: 3,
        versionHash: v3Hash,
        updatedAt: new Date('2026-11-21T08:00:00.000Z'),
        updatedBy: new Types.ObjectId(admin.me.user.id),
      });

      const stale = await repository.moveVersion(
        await scopeOf(t, editor.me, workspaceId),
        THREE_VERSIONS_ID,
        { from: 1, to: 2, versionHash: v2Hash, at: new Date('2026-11-21T08:00:01.000Z') },
      );
      expect(stale).toBeNull();
      expect(await storedLicences(workspaceId)).toEqual([moved]);
    });

    it('updates the licence of a withdrawn item too', async () => {
      const { owner, ownerId, workspaceId } = await workspace();
      await grantLicence(t, workspaceId, WITHDRAWN_TWICE_ID, { version: 1, grantedBy: ownerId });
      const response = await owner
        .post(licenceVersionPath(workspaceId, WITHDRAWN_TWICE_ID), { baseVersion: 1 })
        .expect(200);
      expect(marketplaceLicenceSchema.parse(response.body).version).toBe(2);
    });

    it('finds no licence to update: 404', async () => {
      const { owner, workspaceId } = await workspace();
      for (const itemId of [
        FREE_ITEM_ID,
        DRAFT_ITEM_ID,
        'mp-khong-co-mau-nay',
        'nha-khoa-uu-dai',
      ]) {
        expectNoItem(await owner.post(licenceVersionPath(workspaceId, itemId), { baseVersion: 1 }));
      }
      await owner
        .post(licenceVersionPath(workspaceId, FREE_ITEM_ID), { baseVersion: 0 })
        .expect(422);
    });
  });

  it('keeps each workspace to its own licences: another finds none of them', async () => {
    const a = await workspace();
    await grantLicence(t, a.workspaceId, TWO_VERSIONS_ITEM_ID, {
      version: 1,
      grantedBy: a.ownerId,
    });
    await grantLicence(t, a.workspaceId, WITHDRAWN_ITEM_ID, { version: 1, grantedBy: a.ownerId });
    const before = await storedLicences(a.workspaceId);
    const b = await workspace();

    expect(await licenceList(b.owner, b.workspaceId)).toEqual([]);
    const list = marketplaceListResponseSchema.parse(
      (await b.owner.get(`/workspaces/${b.workspaceId}/marketplace`).expect(200)).body,
    );
    expect(list.ownedCount).toBe(0);
    expect(list.items.some((item) => item.owned)).toBe(false);
    expectNoItem(
      await b.owner.get(`/workspaces/${b.workspaceId}/marketplace/items/${WITHDRAWN_ITEM_ID}`),
    );
    expectNoItem(
      await b.owner.post(licenceVersionPath(b.workspaceId, TWO_VERSIONS_ITEM_ID), {
        baseVersion: 1,
      }),
    );
    // A's routes are not B's: B's owner is not a member there.
    for (const response of [
      await b.owner.get(`/workspaces/${a.workspaceId}/marketplace/licences`),
      await b.owner.post(licenceVersionPath(a.workspaceId, TWO_VERSIONS_ITEM_ID), {
        baseVersion: 1,
      }),
      await b.owner.post(claimPath(a.workspaceId, FREE_ITEM_ID), SEEN),
    ]) {
      expect(response.status).toBe(404);
      expect(problemSchema.parse(response.body).title).toBe('Không tìm thấy workspace');
    }
    // B's own claim is B's licence alone.
    await claimFreeItem(b.owner, b.workspaceId);
    expect(await storedLicences(a.workspaceId)).toEqual(before);
    expect((await licenceList(a.owner, a.workspaceId)).map((row) => row.itemId)).not.toContain(
      FREE_ITEM_ID,
    );
  });

  it('refuses claiming and updating while read-only; browsing and the list stay open', async () => {
    const { owner, ownerId, workspaceId } = await workspace();
    await grantLicence(t, workspaceId, TWO_VERSIONS_ITEM_ID, { version: 1, grantedBy: ownerId });
    const before = await storedLicences(workspaceId);
    await setReadOnly(t, workspaceId, true);
    try {
      for (const response of [
        await owner.post(claimPath(workspaceId, FREE_ITEM_ID), SEEN),
        await owner.post(licenceVersionPath(workspaceId, TWO_VERSIONS_ITEM_ID), {
          baseVersion: 1,
        }),
      ]) {
        expect(response.status).toBe(402);
        expect(problemSchema.parse(response.body).code).toBe('workspace_read_only');
      }
      expect(await licenceList(owner, workspaceId)).toHaveLength(1);
      await owner.get(`/workspaces/${workspaceId}/marketplace/items/${FREE_ITEM_ID}`).expect(200);
      expect(await storedLicences(workspaceId)).toEqual(before);
    } finally {
      await setReadOnly(t, workspaceId, false);
    }
  });
});

describe('"Được dùng nhiều" from the licences', () => {
  let t: TestApp;
  let catalogFile: string;

  beforeAll(async () => {
    catalogFile = marketplaceCatalogFile(testMarketplaceCatalog());
    t = await createTestApp('plp_test_mp_rank', { env: { MARKETPLACE_CATALOG_FILE: catalogFile } });
  });

  afterAll(async () => {
    await t.close();
    rmSync(dirname(catalogFile), { recursive: true, force: true });
  });

  it('ranks the listed items by the workspaces holding each, equal counts sharing a rank', async () => {
    const workspaces = await Promise.all([1, 2, 3].map(() => signedUpClient(t.app)));
    for (const { client, workspaceId } of workspaces) {
      await claimFreeItem(client, workspaceId);
    }
    const [first, second] = workspaces;
    if (first === undefined || second === undefined) {
      throw new Error('No workspaces');
    }
    for (const { me, workspaceId } of [first, second]) {
      await grantLicence(t, workspaceId, 'mp-spa-uu-dai-ngay-le', {
        version: 1,
        grantedBy: me.user.id,
      });
    }
    for (const itemId of [PAID_ITEM_ID, 'mp-mo-ban-du-an-can-ho']) {
      await grantLicence(t, first.workspaceId, itemId, { version: 1, grantedBy: first.me.user.id });
    }
    // Withdrawn items are not ranked, and their licences do not move the others.
    await grantLicence(t, second.workspaceId, WITHDRAWN_ITEM_ID, {
      version: 1,
      grantedBy: second.me.user.id,
    });

    const { client: newcomer, workspaceId } = await signedUpClient(t.app);
    const list = marketplaceListResponseSchema.parse(
      (await newcomer.get(`/workspaces/${workspaceId}/marketplace`).expect(200)).body,
    );
    expect(list.items.map((item) => [item.id, item.popularRank])).toEqual([
      [PAID_ITEM_ID, 3],
      ['mp-mo-ban-du-an-can-ho', 3],
      ['mp-spa-uu-dai-ngay-le', 2],
      [FREE_ITEM_ID, 1],
      [TWO_VERSIONS_ITEM_ID, 5],
    ]);
    const detail = marketplaceItemDetailSchema.parse(
      (
        await newcomer
          .get(`/workspaces/${workspaceId}/marketplace/items/${FREE_ITEM_ID}`)
          .expect(200)
      ).body,
    );
    expect(detail).toMatchObject({ popularRank: 1, owned: false, licence: null });
  });
});

describe('the licences at startup', () => {
  let t: TestApp;
  let owner: { email: string; password: string; workspaceId: string };
  const catalog = licenceCatalog();
  const files: string[] = [];

  function catalogFile(content: MarketplaceCatalog): string {
    const file = marketplaceCatalogFile(content);
    files.push(file);
    return file;
  }

  /** The catalog with one item changed. */
  function changed(itemId: string, change: Partial<MarketplaceItem>): MarketplaceCatalog {
    return {
      ...catalog,
      items: catalog.items.map((item) => (item.id === itemId ? { ...item, ...change } : item)),
    };
  }

  beforeAll(async () => {
    t = await createTestApp('plp_test_mp_startup', {
      env: { MARKETPLACE_CATALOG_FILE: catalogFile(catalog) },
    });
    const input = signupInput();
    const { client, me, workspaceId } = await signedUpClient(t.app, input);
    owner = { email: input.email, password: input.password, workspaceId };
    await claimFreeItem(client, workspaceId);
    for (const [itemId, version] of [
      [PAID_ITEM_ID, 1],
      [TWO_VERSIONS_ITEM_ID, 1],
      [THREE_VERSIONS_ID, 2],
      [WITHDRAWN_ITEM_ID, 1],
    ] as const) {
      await grantLicence(t, workspaceId, itemId, { version, grantedBy: me.user.id });
    }
    const other = await signedUpClient(t.app);
    await grantLicence(t, other.workspaceId, TWO_VERSIONS_ITEM_ID, {
      version: 2,
      grantedBy: other.me.user.id,
    });
  });

  afterAll(async () => {
    await t.close();
    for (const file of files) {
      rmSync(dirname(file), { recursive: true, force: true });
    }
  });

  /** Starts the API again on the same database with `content` as its catalog; it must refuse. */
  async function expectRefused(content: MarketplaceCatalog, problems: string[]): Promise<void> {
    const file = catalogFile(content);
    // A refused start leaves the connections it opened before the check: close them.
    const before = new Set(mongoose.connections);
    try {
      const refused = createTestApp('plp_test_mp_startup', {
        database: t.env.MONGODB_URI,
        env: { MARKETPLACE_CATALOG_FILE: file },
      });
      // Exactly these problems: no more, no fewer.
      await expect(refused).rejects.toMatchObject({
        message: `The marketplace catalog ${file} does not serve the licences workspaces hold (ADR-036):\n${problems.join('\n')}`,
      });
    } finally {
      await Promise.all(
        mongoose.connections
          .filter((connection) => !before.has(connection))
          .map((connection) => connection.close()),
      );
    }
  }

  it('starts again on a catalog that still serves them: a withdrawn item, a new version', async () => {
    const paid = itemIn(catalog, PAID_ITEM_ID);
    const restarted = await createTestApp('plp_test_mp_startup', {
      database: t.env.MONGODB_URI,
      env: {
        MARKETPLACE_CATALOG_FILE: catalogFile(
          changed(PAID_ITEM_ID, {
            status: 'withdrawn',
            versions: [
              ...paid.versions,
              {
                ...versionIn(catalog, TWO_VERSIONS_ITEM_ID, 2),
                releasedOn: '2026-11-21',
                note: 'Tiêu đề mới.',
              },
            ],
          }),
        ),
      },
    });
    try {
      // Signed in at the API started again, which reads the new catalog.
      const client = new TestClient(restarted.app);
      await client
        .post('/auth/login', { email: owner.email, password: owner.password })
        .expect(200);
      const rows = marketplaceLicenceListResponseSchema.parse(
        (await client.get(`/workspaces/${owner.workspaceId}/marketplace/licences`).expect(200))
          .body,
      ).items;
      expect(rows.find((row) => row.itemId === PAID_ITEM_ID)).toMatchObject({
        version: 1,
        latestVersion: 2,
        withdrawn: true,
      });
    } finally {
      await restarted.close();
    }
  });

  it('does not start when an item a licence names left the catalog or became a draft', async () => {
    await expectRefused(
      { ...catalog, items: catalog.items.filter((item) => item.id !== PAID_ITEM_ID) },
      [`✖ ${PAID_ITEM_ID} v1: the catalog no longer has this item (1 licence)`],
    );
    await expectRefused(changed(WITHDRAWN_ITEM_ID, { status: 'draft' }), [
      `✖ ${WITHDRAWN_ITEM_ID} v1: the catalog marks this item as a draft (1 licence)`,
    ]);
  });

  it('does not start when a version a licence names left the file or changed content', async () => {
    const twice = itemIn(catalog, TWO_VERSIONS_ITEM_ID);
    const v1 = versionIn(catalog, TWO_VERSIONS_ITEM_ID, 1);
    const v2 = versionIn(catalog, TWO_VERSIONS_ITEM_ID, 2);
    await expectRefused(changed(TWO_VERSIONS_ITEM_ID, { versions: [v1] }), [
      `✖ ${TWO_VERSIONS_ITEM_ID} v2: the catalog no longer has this version (1 licence)`,
    ]);
    await expectRefused(
      changed(TWO_VERSIONS_ITEM_ID, {
        versions: [{ ...v1, composition: v2.composition }, ...twice.versions.slice(1)],
      }),
      [
        `✖ ${TWO_VERSIONS_ITEM_ID} v1: the content of this version is not what was granted (versionHash) (1 licence)`,
      ],
    );
  });

  it('names every problem at once', async () => {
    const twice = itemIn(catalog, TWO_VERSIONS_ITEM_ID);
    const v2 = versionIn(catalog, TWO_VERSIONS_ITEM_ID, 2);
    await expectRefused(
      {
        ...catalog,
        items: catalog.items
          .filter((item) => item.id !== FREE_ITEM_ID)
          .map((item) =>
            item.id === TWO_VERSIONS_ITEM_ID
              ? {
                  ...twice,
                  versions: [
                    { ...v2, version: 1, releasedOn: '2026-10-01' },
                    ...twice.versions.slice(1),
                  ],
                }
              : item,
          ),
      },
      [
        `✖ ${FREE_ITEM_ID} v1: the catalog no longer has this item (1 licence)`,
        `✖ ${TWO_VERSIONS_ITEM_ID} v1: the content of this version is not what was granted (versionHash) (1 licence)`,
      ],
    );
  });
});
