import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

if (!process.env.MONGODB_URI) {
  try {
    const envFile = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    for (const line of envFile.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (match?.[1] && process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2]?.replace(/^['"]|['"]$/g, '') ?? '';
      }
    }
  } catch {
    // The caller may provide configuration through the environment only.
  }
}

const args = new Set(process.argv.slice(2));
const readOption = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const apply = args.has('--apply');
const masterDatabaseName =
  process.env.MONGODB_MASTER_DATABASE_NAME ?? 'payload_platform_master';
const selectedTenantId = readOption('--tenant');
const selectedDatabase = readOption('--database');

if (args.has('--help')) {
  process.stdout.write(`
Backfill Phase 20.1 dynamic route and collection query projections.

Usage:
  pnpm exec node scripts/phase-20.1-backfill.mjs --dry-run
  pnpm exec node scripts/phase-20.1-backfill.mjs --tenant <tenant-id> --apply
  pnpm exec node scripts/phase-20.1-backfill.mjs --database <tenant-db> --apply

The default is dry-run. --apply is required for writes. The script does not
delete tenants or content; run the tenant cleanup separately after review.
`);
  process.exit(0);
}

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) throw new Error('MONGODB_URI is required');
const { MongoClient } = await import('mongodb');

function dynamicBase(pathPattern) {
  const marker = pathPattern.lastIndexOf('/{');
  return marker > 0 ? pathPattern.slice(0, marker) : undefined;
}

function normalizeUniqueValue(value) {
  if (typeof value === 'string') return value.trim().toLowerCase();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function searchText(values) {
  return JSON.stringify(values).toLowerCase().slice(0, 20_000);
}

function uniqueTokens(fields, values) {
  return fields
    .filter(
      (field) =>
        field.unique &&
        field.status !== 'archived' &&
        values[field.key] !== undefined &&
        values[field.key] !== null &&
        values[field.key] !== '',
    )
    .map(
      (field) =>
        `${field.id}:${encodeURIComponent(normalizeUniqueValue(values[field.key]))}`,
    );
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function databasesFor(client) {
  if (selectedDatabase) return [selectedDatabase];
  const tenants = await client
    .db(masterDatabaseName)
    .collection('tenants')
    .find(selectedTenantId ? { _id: selectedTenantId } : { status: 'active' }, {
      projection: { databaseName: 1 },
    })
    .toArray();
  if (tenants.length) return tenants.map((tenant) => tenant.databaseName).filter(Boolean);
  const fallback = new URL(mongoUri).pathname.replace(/^\/+/, '');
  return [
    fallback || process.env.MONGODB_LEGACY_DATABASE_NAME || 'payload_landing_platform',
  ];
}

async function migrateDatabase(database) {
  const pages = database.collection('landingPages');
  const collections = database.collection('collectionDefinitions');
  const entries = database.collection('collectionEntries');
  const versions = database.collection('collectionEntryVersions');

  const dynamicPages = await pages
    .find({ kind: 'dynamic', pathPattern: { $type: 'string' } })
    .toArray();
  const baseOwners = new Map();
  for (const page of dynamicPages) {
    const base = dynamicBase(page.pathPattern);
    if (!base) continue;
    const owner = baseOwners.get(base);
    if (owner && owner !== page._id) {
      throw new Error(`Dynamic route base conflict in ${database.databaseName}: ${base}`);
    }
    baseOwners.set(base, page._id);
  }

  const collectionFields = new Map();
  let fieldIdsAdded = 0;
  for (const collection of await collections.find({}).toArray()) {
    const fields = (collection.fields ?? []).map((field) => {
      if (field.id) return field;
      fieldIdsAdded += 1;
      return { ...field, id: randomUUID() };
    });
    collectionFields.set(String(collection._id), fields);
    if (JSON.stringify(fields) !== JSON.stringify(collection.fields ?? [])) {
      if (apply)
        await collections.updateOne({ _id: collection._id }, { $set: { fields } });
    }
  }

  let pagesChanged = 0;
  for (const page of dynamicPages) {
    const base = dynamicBase(page.pathPattern);
    if (!base) continue;
    const needsBackfill =
      page.dynamicBasePath !== base || page.path !== undefined || page.slug !== undefined;
    if (!needsBackfill) continue;
    pagesChanged += 1;
    if (apply) {
      await pages.updateOne(
        { _id: page._id },
        { $set: { dynamicBasePath: base }, $unset: { path: 1, slug: 1 } },
      );
    }
  }

  let entriesChanged = 0;
  for (const entry of await entries.find({}).toArray()) {
    const fields = collectionFields.get(String(entry.collectionId)) ?? [];
    const draft = entry.draftVersionId
      ? await versions.findOne({ _id: entry.draftVersionId, entryId: entry._id })
      : undefined;
    const published = entry.publishedVersionId
      ? await versions.findOne({ _id: entry.publishedVersionId, entryId: entry._id })
      : undefined;
    const draftValues = draft?.values;
    const publishedValues = published?.values;
    const currentValues = draftValues ?? publishedValues;
    if (!currentValues) continue;
    const set = {
      ...(draftValues ? { draftValues, draftSearchText: searchText(draftValues) } : {}),
      ...(publishedValues
        ? { publishedValues, publishedSearchText: searchText(publishedValues) }
        : {}),
      ...(currentValues ? { uniqueTokens: uniqueTokens(fields, currentValues) } : {}),
    };
    const autoSlugSourceValues = {};
    for (const field of fields) {
      if (
        field.type === 'slug' &&
        field.slugFromFieldKey &&
        currentValues[field.slugFromFieldKey] !== undefined
      ) {
        autoSlugSourceValues[field.key] = String(currentValues[field.slugFromFieldKey]);
      }
    }
    if (Object.keys(autoSlugSourceValues).length)
      set.autoSlugSourceValues = autoSlugSourceValues;
    const needsBackfill = Object.entries(set).some(
      ([key, value]) => !sameValue(entry[key], value),
    );
    if (!needsBackfill) continue;
    entriesChanged += 1;
    if (apply) await entries.updateOne({ _id: entry._id }, { $set: set });
  }

  if (apply) {
    await pages.createIndex(
      { workspaceId: 1, siteId: 1, dynamicBasePath: 1 },
      {
        unique: true,
        partialFilterExpression: {
          kind: 'dynamic',
          dynamicBasePath: { $type: 'string' },
        },
      },
    );
    await entries.createIndex(
      { workspaceId: 1, siteId: 1, collectionId: 1, uniqueTokens: 1 },
      {
        unique: true,
        partialFilterExpression: {
          status: { $in: ['draft', 'published'] },
          uniqueTokens: { $exists: true },
        },
      },
    );
  }
  return { database: database.databaseName, pagesChanged, entriesChanged, fieldIdsAdded };
}

const client = new MongoClient(mongoUri);
try {
  await client.connect();
  const summaries = [];
  for (const databaseName of await databasesFor(client)) {
    summaries.push(await migrateDatabase(client.db(databaseName)));
  }
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', summaries }, null, 2));
} finally {
  await client.close();
}
