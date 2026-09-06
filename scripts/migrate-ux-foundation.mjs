import process from 'node:process';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply') && !args.has('--dry-run');
const databaseName = process.argv.includes('--database')
  ? process.argv[process.argv.indexOf('--database') + 1]
  : undefined;
const markerId = 'ux-foundation-consolidation-v1';

if (args.has('--help')) {
  process.stdout.write(`
Consolidate legacy site-owned Navigation and Collection records into workspace ownership.

Usage:
  pnpm exec node scripts/migrate-ux-foundation.mjs --dry-run
  pnpm exec node scripts/migrate-ux-foundation.mjs --database <tenant-db> --apply

The default is dry-run. --apply is required for writes. Rows with duplicate
workspace keys are reported and intentionally remain legacy-scoped.
`);
  process.exit(0);
}

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) throw new Error('MONGODB_URI is required.');
const { MongoClient } = await import('mongodb');
const client = new MongoClient(mongoUri);
await client.connect();

function groupsBy(records, key) {
  const groups = new Map();
  for (const record of records) {
    const value = `${record.workspaceId}:${record[key]}`;
    const current = groups.get(value) ?? [];
    current.push(record);
    groups.set(value, current);
  }
  return groups;
}

async function migrateDatabase(database) {
  const marker = await database.collection('tenantMigrations').findOne({ _id: markerId });
  if (marker?.status === 'complete') {
    const [legacyCollections, legacyNavigations] = await Promise.all([
      database.collection('collectionDefinitions').countDocuments({
        siteId: { $exists: true },
      }),
      database.collection('navigations').countDocuments({ siteId: { $exists: true } }),
    ]);
    if (legacyCollections === 0 && legacyNavigations === 0)
      return { skipped: true, reason: 'already-complete' };
  }

  const collections = await database
    .collection('collectionDefinitions')
    .find({ siteId: { $exists: true } })
    .toArray();
  const navigations = await database
    .collection('navigations')
    .find({ siteId: { $exists: true } })
    .toArray();
  const collectionGroups = groupsBy(collections, 'key');
  const navigationGroups = groupsBy(navigations, 'key');
  const collisions = {
    collections: [...collectionGroups]
      .filter(([, rows]) => rows.length > 1)
      .map(([key, rows]) => ({ key, ids: rows.map((row) => row._id) })),
    navigations: [...navigationGroups]
      .filter(([, rows]) => rows.length > 1)
      .map(([key, rows]) => ({ key, ids: rows.map((row) => row._id) })),
  };
  const collectionIdsToMigrate = collections
    .filter(
      (row) =>
        !collisions.collections.some((collision) => collision.ids.includes(row._id)),
    )
    .map((row) => row._id);
  const navigationIdsToMigrate = navigations
    .filter(
      (row) =>
        !collisions.navigations.some((collision) => collision.ids.includes(row._id)),
    )
    .map((row) => row._id);
  const workspaces = await database
    .collection('workspaces')
    .find({})
    .sort({ createdAt: 1, _id: 1 })
    .toArray();
  const designSystemBases = [];
  for (const workspace of workspaces) {
    if (workspace.designSystemDraft || workspace.publishedDesignSystem) continue;
    const site = await database.collection('sites').findOne(
      {
        workspaceId: workspace._id,
        $or: [
          { designSystemDraft: { $exists: true } },
          { publishedDesignSystem: { $exists: true } },
        ],
      },
      { sort: { createdAt: 1, _id: 1 } },
    );
    if (!site) continue;
    designSystemBases.push({ workspaceId: workspace._id, sourceSiteId: site._id });
    if (apply) {
      await database.collection('workspaces').updateOne(
        { _id: workspace._id },
        {
          $set: {
            ...(site.designSystemDraft
              ? { designSystemDraft: site.designSystemDraft }
              : {}),
            ...(site.publishedDesignSystem
              ? { publishedDesignSystem: site.publishedDesignSystem }
              : {}),
          },
        },
      );
    }
  }
  const hasCollisions =
    collisions.collections.length > 0 || collisions.navigations.length > 0;
  if (apply) {
    if (collectionIdsToMigrate.length) {
      await database
        .collection('collectionDefinitions')
        .updateMany({ _id: { $in: collectionIdsToMigrate } }, { $unset: { siteId: 1 } });
      await database
        .collection('collectionEntries')
        .updateMany(
          { collectionId: { $in: collectionIdsToMigrate } },
          { $unset: { siteId: 1 } },
        );
      await database
        .collection('collectionEntryVersions')
        .updateMany(
          { collectionId: { $in: collectionIdsToMigrate } },
          { $unset: { siteId: 1 } },
        );
    }
    if (navigationIdsToMigrate.length) {
      await database
        .collection('navigations')
        .updateMany({ _id: { $in: navigationIdsToMigrate } }, { $unset: { siteId: 1 } });
    }
    await database.collection('tenantMigrations').updateOne(
      { _id: markerId },
      {
        $set: {
          status: hasCollisions ? 'blocked' : 'complete',
          lastRunAt: new Date(),
          collisions,
          ...(hasCollisions ? {} : { completedAt: new Date() }),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    );
  }
  return {
    dryRun: !apply,
    collections: { scanned: collections.length, migrated: collectionIdsToMigrate.length },
    navigations: { scanned: navigations.length, migrated: navigationIdsToMigrate.length },
    collisions,
    status: hasCollisions ? 'blocked' : 'complete',
    designSystemBases,
  };
}

try {
  const fallbackDatabase =
    new URL(mongoUri).pathname.replace(/^\//, '') || 'payload_landing_platform';
  const database = client.db(databaseName ?? fallbackDatabase);
  process.stdout.write(
    `${JSON.stringify({ database: database.databaseName, ...(await migrateDatabase(database)) }, null, 2)}\n`,
  );
} finally {
  await client.close();
}
