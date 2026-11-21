import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MarketplaceCatalog, MarketplaceItem } from '@plp/contracts';
import { setAtPath } from '@plp/sections/schema';
import { BUNDLED_MARKETPLACE_CATALOG_FILE } from '../src/config/env.js';

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

/** A draft, never shown. */
export const DRAFT_ITEM_ID = 'mp-mau-dang-soan';
/** No longer sold: shown to no workspace before licences exist (MP2). */
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
