import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MongoClient, ObjectId } from 'mongodb';

/*
 * The marketplace catalog of the E2E and capture web servers (ADR-036, MP2). The bundled one has
 * four listed items, each at v1, so the update of a licence (board 32's "CÓ BẢN v2") has nothing
 * to show. This one is the bundled catalog plus one WITHDRAWN item with two versions: withdrawn
 * items are not on board 30, so every count and card of MP1 stays valid, and only a workspace
 * seeded with a licence of it (`seedLicence`) sees it. The bundled file itself is never changed.
 */

const BUNDLED_FILE = fileURLToPath(new URL('../../../apps/api/marketplace.json', import.meta.url));
const OUTPUT_DIR = fileURLToPath(new URL('../.marketplace/', import.meta.url));

export const VERSIONED_ITEM_ID = 'mp-mau-e2e-hai-phien-ban';
export const VERSIONED_ITEM_NAME = 'Mẫu E2E hai phiên bản';
export const V2_HEADING = 'Tiêu đề mới của phiên bản 2';
export const V2_NOTE = 'Đổi tiêu đề của Hero.';

interface CatalogItem {
  id: string;
  status: string;
  name: string;
  versions: Array<{
    version: number;
    releasedOn: string;
    note?: string;
    composition: { sections: Array<{ type: string; content: Record<string, unknown> }> };
  }>;
  [key: string]: unknown;
}

export interface E2eCatalog {
  items: CatalogItem[];
  [key: string]: unknown;
}

export function bundledCatalog(): E2eCatalog {
  return JSON.parse(readFileSync(BUNDLED_FILE, 'utf8')) as E2eCatalog;
}

/** The bundled catalog and the withdrawn item with two versions, for the specs' API servers. */
export function e2eCatalog(): E2eCatalog {
  const catalog = bundledCatalog();
  const gym = catalog.items.find((item) => item.id === 'mp-khai-truong-phong-tap');
  const v1 = gym?.versions[0];
  if (gym === undefined || v1 === undefined) {
    throw new Error('The bundled marketplace catalog has no gym item at v1');
  }
  const v2Sections = v1.composition.sections.map((section) =>
    section.type === 'hero'
      ? { ...section, content: { ...section.content, heading: V2_HEADING } }
      : section,
  );
  return {
    ...catalog,
    items: [
      ...catalog.items,
      {
        ...gym,
        id: VERSIONED_ITEM_ID,
        status: 'withdrawn',
        name: VERSIONED_ITEM_NAME,
        price: 150_000,
        versions: [
          { ...v1, releasedOn: '2026-10-01' },
          {
            version: 2,
            releasedOn: '2026-10-20',
            note: V2_NOTE,
            composition: { ...v1.composition, sections: v2Sections },
          },
        ],
      },
    ],
  };
}

/** Writes the catalog under `.marketplace/` (gitignored) and returns its path. */
export function writeE2eCatalog(): string {
  const file = `${OUTPUT_DIR}marketplace.json`;
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(file, JSON.stringify(e2eCatalog(), null, 2));
  return file;
}

/** The same canonical JSON as the API's `versionHashOf`: sorted keys, no spaces. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
}

/**
 * Seeds the master DB with the workspace's licence of the versioned item at v1, as a purchase
 * will have granted it (MP3): the way of the one thing the API cannot do yet, holding an item
 * that is not free. `database` is the master DB of the run (the API's `MONGODB_URI`).
 */
export async function seedLicence(
  database: string,
  workspaceId: string,
  memberId: string,
): Promise<void> {
  const v1 = e2eCatalog().items.find((item) => item.id === VERSIONED_ITEM_ID)?.versions[0];
  if (v1 === undefined) {
    throw new Error('The E2E marketplace catalog has no versioned item');
  }
  const client = new MongoClient(`mongodb://localhost:27117/?replicaSet=rs0`);
  try {
    const at = new Date('2026-10-05T03:00:00.000Z');
    await client
      .db(database)
      .collection('marketplace_licences')
      .insertOne({
        workspaceId: new ObjectId(workspaceId),
        itemId: VERSIONED_ITEM_ID,
        source: 'purchase',
        version: 1,
        versionHash: createHash('sha256')
          .update(canonicalJson(v1.composition), 'utf8')
          .digest('hex'),
        invoiceId: null,
        termsVersion: 1,
        grantedAt: at,
        grantedBy: new ObjectId(memberId),
        updatedAt: at,
        updatedBy: new ObjectId(memberId),
      });
  } finally {
    await client.close();
  }
}
