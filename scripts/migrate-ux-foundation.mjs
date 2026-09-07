import process from 'node:process';
import {
  isFullDesignSystem,
  migrationCollisionReport,
  normalizeSiteDesignSystemOverride,
  planCollectionMigrations,
  planNavigationMigrations,
} from './ux-foundation-migration-plan.mjs';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply') && !args.has('--dry-run');
const databaseName = process.argv.includes('--database')
  ? process.argv[process.argv.indexOf('--database') + 1]
  : undefined;
const markerId = 'ux-foundation-consolidation-v2';

if (args.has('--help')) {
  process.stdout.write(`
Repair UX Foundation ownership while preserving public legacy navigation.

Usage:
  pnpm exec node scripts/migrate-ux-foundation.mjs --dry-run
  pnpm exec node scripts/migrate-ux-foundation.mjs --database <tenant-db> --apply

The default is dry-run. --apply is required for writes. Legacy navigation rows
remain site-owned so existing public resolution keeps working; deterministic
workspace-owned copies are created alongside them.
`);
  process.exit(0);
}

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) throw new Error('MONGODB_URI is required.');
const { MongoClient } = await import('mongodb');
const client = new MongoClient(mongoUri);
await client.connect();

async function migrateDatabase(database) {
  const marker = await database.collection('tenantMigrations').findOne({ _id: markerId });
  const [legacyCollections, legacyNavigations, canonicalNavigations] = await Promise.all([
    database
      .collection('collectionDefinitions')
      .find({ siteId: { $exists: true } })
      .toArray(),
    database
      .collection('navigations')
      .find({ siteId: { $exists: true } })
      .toArray(),
    database
      .collection('navigations')
      .find({ siteId: { $exists: false } })
      .toArray(),
  ]);
  const canonicalCollections = await database
    .collection('collectionDefinitions')
    .find({ siteId: { $exists: false } })
    .toArray();

  const collectionPlan = planCollectionMigrations(
    legacyCollections,
    canonicalCollections,
  );
  const navigationPlan = planNavigationMigrations(
    legacyNavigations,
    canonicalNavigations,
  );
  const collisions = {
    collections: migrationCollisionReport(legacyCollections),
    navigations: migrationCollisionReport(legacyNavigations),
  };
  const designSystemBases = [];
  const workspaceDesignSystemUpdates = [];
  const siteDesignSystemUpdates = [];
  const workspaces = await database
    .collection('workspaces')
    .find({})
    .sort({ createdAt: 1, _id: 1 })
    .toArray();
  for (const workspace of workspaces) {
    const sites = await database
      .collection('sites')
      .find({ workspaceId: workspace._id })
      .sort({ createdAt: 1, _id: 1 })
      .toArray();
    const draftSource = sites.find((site) => isFullDesignSystem(site.designSystemDraft));
    const publishedSource = sites.find((site) =>
      isFullDesignSystem(site.publishedDesignSystem),
    );
    const draftBase = isFullDesignSystem(workspace.designSystemDraft)
      ? workspace.designSystemDraft
      : draftSource?.designSystemDraft;
    const publishedBase = isFullDesignSystem(workspace.publishedDesignSystem)
      ? workspace.publishedDesignSystem
      : publishedSource?.publishedDesignSystem;
    const siteUpdates = [];
    const unresolved = [];
    for (const site of sites) {
      const update = {};
      if (isFullDesignSystem(site.designSystemDraft)) {
        if (draftBase) {
          update.designSystemDraft = normalizeSiteDesignSystemOverride(
            draftBase,
            site.designSystemDraft,
          );
        } else {
          unresolved.push({ siteId: site._id, field: 'designSystemDraft' });
        }
      }
      if (isFullDesignSystem(site.publishedDesignSystem)) {
        if (publishedBase) {
          update.publishedDesignSystem = normalizeSiteDesignSystemOverride(
            publishedBase,
            site.publishedDesignSystem,
          );
        } else {
          unresolved.push({ siteId: site._id, field: 'publishedDesignSystem' });
        }
      }
      if (Object.keys(update).length) siteUpdates.push({ siteId: site._id, update });
    }
    if (draftBase || publishedBase || unresolved.length || siteUpdates.length) {
      const sourceSiteId = draftSource?._id ?? publishedSource?._id;
      designSystemBases.push({
        workspaceId: workspace._id,
        ...(sourceSiteId ? { sourceSiteId } : {}),
        ...(unresolved.length ? { unresolved } : {}),
        ...(siteUpdates.length
          ? { normalizedSites: siteUpdates.map(({ siteId }) => siteId) }
          : {}),
        ...(!draftBase && !publishedBase ? { status: 'requires-normalization' } : {}),
      });
    }
    const workspaceUpdate = {};
    if (!isFullDesignSystem(workspace.designSystemDraft) && draftSource) {
      workspaceUpdate.designSystemDraft = draftBase;
    }
    if (!isFullDesignSystem(workspace.publishedDesignSystem) && publishedSource) {
      workspaceUpdate.publishedDesignSystem = publishedBase;
    }
    if (Object.keys(workspaceUpdate).length) {
      workspaceDesignSystemUpdates.push({
        workspaceId: workspace._id,
        update: workspaceUpdate,
      });
    }
    siteDesignSystemUpdates.push(...siteUpdates);
  }

  const report = {
    dryRun: !apply,
    marker: markerId,
    previousMarker: marker?.status ?? null,
    collections: {
      scanned: legacyCollections.length,
      planned: collectionPlan.length,
      actions: collectionPlan,
      collisionGroups: collisions.collections,
    },
    navigations: {
      scanned: legacyNavigations.length,
      planned: navigationPlan.length,
      actions: navigationPlan,
      collisionGroups: collisions.navigations,
      compatibility: 'legacy site-owned rows are preserved',
    },
    designSystemBases,
    status: 'complete',
  };

  if (apply) {
    const migrations = database.collection('tenantMigrations');
    await migrations.updateOne(
      { _id: markerId },
      {
        $set: { status: 'running', lastRunAt: new Date(), report },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    );
    try {
      for (const { workspaceId, update } of workspaceDesignSystemUpdates) {
        await database
          .collection('workspaces')
          .updateOne({ _id: workspaceId }, { $set: update });
      }
      for (const { siteId, update } of siteDesignSystemUpdates) {
        await database.collection('sites').updateOne({ _id: siteId }, { $set: update });
      }
      await database
        .collection('collectionDefinitions')
        .updateMany(
          { ownershipScope: { $exists: false }, siteId: { $exists: true } },
          { $set: { ownershipScope: 'site' } },
        );
      await database
        .collection('collectionDefinitions')
        .updateMany(
          { ownershipScope: { $exists: false }, siteId: { $exists: false } },
          { $set: { ownershipScope: 'workspace' } },
        );
      await database
        .collection('navigations')
        .updateMany(
          { ownershipScope: { $exists: false }, siteId: { $exists: true } },
          { $set: { ownershipScope: 'site' } },
        );
      await database
        .collection('navigations')
        .updateMany(
          { ownershipScope: { $exists: false }, siteId: { $exists: false } },
          { $set: { ownershipScope: 'workspace' } },
        );
      for (const action of collectionPlan) {
        await database.collection('collectionDefinitions').updateOne(
          { _id: action.collectionId, siteId: action.siteId },
          {
            $unset: { siteId: 1 },
            $set: {
              ownershipScope: 'workspace',
              ...(action.sourceKey !== action.canonicalKey
                ? { key: action.canonicalKey }
                : {}),
            },
          },
        );
        await database
          .collection('collectionEntries')
          .updateMany({ collectionId: action.collectionId }, { $unset: { siteId: 1 } });
        await database
          .collection('collectionEntryVersions')
          .updateMany({ collectionId: action.collectionId }, { $unset: { siteId: 1 } });
      }
      for (const action of navigationPlan.filter((item) => !item.alreadyPresent)) {
        const source = legacyNavigations.find(
          (record) => String(record._id) === action.sourceId,
        );
        if (!source) continue;
        await database.collection('navigations').updateOne(
          { _id: action.canonicalId },
          {
            $setOnInsert: {
              _id: action.canonicalId,
              workspaceId: action.workspaceId,
              name: source.name,
              key: action.canonicalKey,
              items: source.items ?? [],
              ownershipScope: 'workspace',
              createdAt: source.createdAt ?? new Date(),
              updatedAt: source.updatedAt ?? new Date(),
              migrationSourceId: action.sourceId,
              migrationId: markerId,
            },
          },
          { upsert: true },
        );
      }
      const completedAt = new Date();
      await migrations.updateOne(
        { _id: markerId },
        { $set: { status: 'complete', completedAt, lastRunAt: completedAt, report } },
      );
    } catch (error) {
      await migrations.updateOne(
        { _id: markerId },
        {
          $set: {
            status: 'failed',
            lastRunAt: new Date(),
            error: error instanceof Error ? error.message : String(error),
            report,
          },
        },
      );
      throw error;
    }
  }
  return report;
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
