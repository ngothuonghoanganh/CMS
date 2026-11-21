import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type ClaimMarketplaceItemRequest,
  type MarketplaceCatalog,
  type MarketplaceItem,
  type MarketplaceLicence,
  type MarketplaceLicenceSource,
  marketplaceLicenceSchema,
} from '@plp/contracts';
import { setAtPath } from '@plp/sections/schema';
import { Types } from 'mongoose';
import { BUNDLED_MARKETPLACE_CATALOG_FILE } from '../src/config/env.js';
import { versionHashOf } from '../src/modules/marketplace/domain/version-hash.js';
import { MarketplaceLicences } from '../src/modules/marketplace/marketplace-licences.js';
import { MarketplaceLicencesRepository } from '../src/modules/marketplace/marketplace-licences.repository.js';
import type { TestApp } from './app.js';
import type { TestClient } from './client.js';

/** The catalog that comes with the API, as written in its file (ADR-036). */
export function bundledMarketplaceCatalog(): MarketplaceCatalog {
  return JSON.parse(readFileSync(BUNDLED_MARKETPLACE_CATALOG_FILE, 'utf8')) as MarketplaceCatalog;
}

/**
 * Writes `content` as a catalog file and returns its path, for
 * `createTestApp(..., { env: { MARKETPLACE_CATALOG_FILE } })`: the API reads it once, at startup.
 * A string is written as it is, anything else as JSON.
 */
export function marketplaceCatalogFile(content: unknown): string {
  const file = join(mkdtempSync(join(tmpdir(), 'plp-marketplace-')), 'marketplace.json');
  writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  return file;
}

function bundledItem(catalog: MarketplaceCatalog, id: string): MarketplaceItem {
  const item = catalog.items.find((candidate) => candidate.id === id);
  if (item === undefined) {
    throw new Error(`The bundled marketplace catalog has no "${id}"`);
  }
  return item;
}

/** The bundled catalog's free item: the one "Nhận mẫu" claims. */
export const FREE_ITEM_ID = 'mp-khoa-hoc-tieng-anh-tre-em';
/** A bundled item with a price (399.000đ). */
export const PAID_ITEM_ID = 'mp-khai-truong-phong-tap';
/** A draft, never shown. */
export const DRAFT_ITEM_ID = 'mp-mau-dang-soan';
/** No longer sold: only a workspace holding its licence sees it. */
export const WITHDRAWN_ITEM_ID = 'mp-mau-ngung-ban';
/** Released twice: v2 changed the Hero's heading. */
export const TWO_VERSIONS_ITEM_ID = 'mp-mau-hai-phien-ban';
export const V2_HEADING = 'Tiêu đề mới của phiên bản 2';

/**
 * The bundled catalog with the kinds of item ADR-036 asks the tests to cover: a draft, a
 * withdrawn item and an item with two versions, after the four bundled ones (one of them free).
 */
export function testMarketplaceCatalog(): MarketplaceCatalog {
  const catalog = bundledMarketplaceCatalog();
  const gym = bundledItem(catalog, 'mp-khai-truong-phong-tap');
  const v1 = gym.versions[0];
  if (v1 === undefined) {
    throw new Error('The bundled gym item has no v1');
  }
  const heroIndex = v1.composition.sections.findIndex((section) => section.type === 'hero');
  const v2Sections = v1.composition.sections.map((section, index) =>
    index === heroIndex
      ? { ...section, content: setAtPath(section.content, 'heading', V2_HEADING) }
      : section,
  );
  return {
    ...catalog,
    items: [
      ...catalog.items,
      { ...gym, id: DRAFT_ITEM_ID, status: 'draft', name: 'Mẫu đang soạn' },
      { ...gym, id: WITHDRAWN_ITEM_ID, status: 'withdrawn', name: 'Mẫu ngừng bán' },
      {
        ...gym,
        id: TWO_VERSIONS_ITEM_ID,
        name: 'Mẫu có hai phiên bản',
        price: 150_000,
        versions: [
          { ...v1, releasedOn: '2026-10-01' },
          {
            version: 2,
            releasedOn: '2026-10-20',
            note: 'Đổi tiêu đề của Hero.',
            composition: { ...v1.composition, sections: v2Sections },
          },
        ],
      },
    ],
  };
}

/** The path of "Nhận mẫu" for an item of the workspace's marketplace. */
export function claimPath(workspaceId: string, itemId: string): string {
  return `/workspaces/${workspaceId}/marketplace/items/${itemId}/claim`;
}

/** The path of "Cập nhật" for the workspace's licence of an item. */
export function licenceVersionPath(workspaceId: string, itemId: string): string {
  return `/workspaces/${workspaceId}/marketplace/licences/${itemId}/version`;
}

/**
 * "Nhận mẫu" of the free item, at v1 under the terms v1 of the test catalogs: the licence it
 * answers with. For a test that needs a licence the way a member gets one.
 */
export async function claimFreeItem(
  client: TestClient,
  workspaceId: string,
  request: ClaimMarketplaceItemRequest = { version: 1, termsVersion: 1 },
): Promise<MarketplaceLicence> {
  const response = await client.post(claimPath(workspaceId, FREE_ITEM_ID), request).expect(200);
  return marketplaceLicenceSchema.parse(response.body);
}

/**
 * Grants the workspace a licence of any item of the app's catalog at `version`, straight through
 * the repository, as a paid invoice will (MP3): for tests of a paid item before purchases exist,
 * or of a version that is no longer the current one. `grantedBy` is the buyer, a member's id.
 */
export async function grantLicence(
  t: TestApp,
  workspaceId: string,
  itemId: string,
  options: { version: number; grantedBy: string; source?: MarketplaceLicenceSource },
): Promise<void> {
  const item = t.app.get(MarketplaceLicences).catalog.items.find((entry) => entry.id === itemId);
  const version = item?.versions.find((entry) => entry.version === options.version);
  if (version === undefined) {
    throw new Error(`The app's marketplace catalog has no ${itemId} v${options.version}`);
  }
  const source = options.source ?? 'purchase';
  const { granted } = await t.app.get(MarketplaceLicencesRepository).grant(
    { workspaceId: new Types.ObjectId(workspaceId) },
    {
      itemId,
      source,
      version: version.version,
      versionHash: versionHashOf(version.composition),
      // A purchase names its paid invoice; none exists before MP3, so any id stands for it.
      invoiceId: source === 'purchase' ? new Types.ObjectId() : null,
      termsVersion: 1,
      grantedBy: new Types.ObjectId(options.grantedBy),
      at: new Date(),
    },
  );
  if (!granted) {
    throw new Error(`Workspace ${workspaceId} already holds a licence of ${itemId}`);
  }
}
