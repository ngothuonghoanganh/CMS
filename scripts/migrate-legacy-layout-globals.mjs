import process from 'node:process';

import {
  layoutSlot,
  legacyDocument,
  legacyGlobal,
  uuidFor,
} from './legacy-layout-migration-utils.mjs';

const args = new Set(process.argv.slice(2));
const readOption = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const apply = args.has('--apply');
const dryRun = !apply || args.has('--dry-run');
const selectedDatabase = readOption('--database');
const selectedTenantId = readOption('--tenant');
const masterDatabaseName =
  process.env.MONGODB_MASTER_DATABASE_NAME ?? 'payload_platform_master';

if (args.has('--help')) {
  process.stdout.write(`
Migrate legacy Site.globalsDraft/publishedGlobals Header/Footer documents.

Usage:
  pnpm exec node scripts/migrate-legacy-layout-globals.mjs --dry-run
  pnpm exec node scripts/migrate-legacy-layout-globals.mjs --apply
  pnpm exec node scripts/migrate-legacy-layout-globals.mjs --database <tenant-db> --apply
  pnpm exec node scripts/migrate-legacy-layout-globals.mjs --tenant <tenant-id> --apply

The default is dry-run. --apply is required for writes. Existing explicit page
attachments are preserved; only missing legacy Header/Footer attachments are added.
`);
  process.exit(0);
}

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  throw new Error(
    'MONGODB_URI is required. Load the project .env file before running this script.',
  );
}

const { MongoClient } = await import('mongodb');

async function tenantDatabases(client) {
  if (selectedDatabase) return [selectedDatabase];
  const master = client.db(masterDatabaseName);
  const filter = selectedTenantId ? { _id: selectedTenantId } : { status: 'active' };
  const tenants = await master
    .collection('tenants')
    .find(filter, { projection: { databaseName: 1 } })
    .toArray();
  if (tenants.length > 0) {
    return tenants
      .map((tenant) => tenant.databaseName)
      .filter(
        (databaseName) => typeof databaseName === 'string' && databaseName.length > 0,
      );
  }

  // Early installations predate the tenant control plane. In that case, use
  // the database encoded in MONGODB_URI so the migration remains usable.
  const parsed = new URL(mongoUri);
  const legacyDatabase = parsed.pathname.replace(/^\/+/, '');
  return [
    legacyDatabase ||
      process.env.MONGODB_LEGACY_DATABASE_NAME ||
      'payload_landing_platform',
  ];
}

async function migrateSite(database, site) {
  const resources = database.collection('layoutExtensions');
  const versions = database.collection('layoutExtensionVersions');
  const pages = database.collection('landingPages');
  const now = new Date();
  const migrated = [];
  let conflicts = 0;
  let skipped = 0;

  for (const kind of ['header', 'footer']) {
    const rawDraft = site.globalsDraft?.[kind];
    const rawPublished = site.publishedGlobals?.[kind];
    const draft = legacyGlobal(site, 'draft', kind);
    const published = legacyGlobal(site, 'published', kind);
    if (rawDraft !== undefined && !draft) skipped += 1;
    if (rawPublished !== undefined && !published) skipped += 1;
    if (!draft && !published) continue;
    // Older globals commonly copied the published snapshot into the draft
    // field. Do not manufacture an unnecessary unpublished version for it.
    const draftForMigration =
      draft && (!published || JSON.stringify(draft) !== JSON.stringify(published))
        ? draft
        : undefined;

    const resourceId = uuidFor(`legacy-layout:${site._id}:${kind}`);
    const publishedVersionId = published
      ? uuidFor(`legacy-layout:${site._id}:${kind}:published`)
      : undefined;
    const draftVersionId = draftForMigration
      ? uuidFor(`legacy-layout:${site._id}:${kind}:draft`)
      : undefined;
    const existingResource = await resources
      .findOne({ _id: resourceId })
      .project({ workspaceId: 1, siteId: 1, kind: 1 })
      .next();
    if (
      existingResource &&
      (existingResource.workspaceId !== site.workspaceId ||
        existingResource.siteId !== site._id ||
        existingResource.kind !== kind)
    ) {
      conflicts += 1;
      continue;
    }
    const resource = {
      _id: resourceId,
      workspaceId: site.workspaceId,
      siteId: site._id,
      kind,
      name: `Migrated legacy ${kind}`,
      description: 'Migrated from legacy Site globals.',
      ...(draftVersionId ? { draftVersionId } : {}),
      ...(publishedVersionId ? { publishedVersionId } : {}),
      createdAt: now,
      updatedAt: now,
    };
    const versionRecords = [];
    if (published) {
      versionRecords.push({
        _id: publishedVersionId,
        resourceId,
        versionNumber: 1,
        document: published,
        status: 'published',
        createdAt: now,
      });
    }
    if (draftForMigration) {
      versionRecords.push({
        _id: draftVersionId,
        resourceId,
        versionNumber: published ? 2 : 1,
        document: draftForMigration,
        status: 'draft',
        createdAt: now,
      });
    }

    const pagesForSite = await pages
      .find({ siteId: site._id, workspaceId: site.workspaceId })
      .project({ _id: 1, layoutAttachments: 1 })
      .toArray();
    const pagesToBackfill = pagesForSite.filter((page) => {
      const attachments = Array.isArray(page.layoutAttachments)
        ? page.layoutAttachments.filter(
            (attachment) => attachment && typeof attachment === 'object',
          )
        : [];
      return !attachments.some((attachment) => attachment.type === kind);
    });

    if (!dryRun) {
      await resources.updateOne(
        { _id: resourceId },
        { $setOnInsert: resource },
        { upsert: true },
      );
      for (const version of versionRecords) {
        await versions.updateOne(
          { _id: version._id },
          { $setOnInsert: version },
          { upsert: true },
        );
      }
      for (const page of pagesForSite) {
        const attachments = Array.isArray(page.layoutAttachments)
          ? page.layoutAttachments.filter(
              (attachment) => attachment && typeof attachment === 'object',
            )
          : [];
        if (attachments.some((attachment) => attachment.type === kind)) continue;
        attachments.push({
          id: uuidFor(`legacy-layout-attachment:${site._id}:${page._id}:${kind}`),
          type: kind,
          resourceId,
          slot: layoutSlot(kind),
          enabled: true,
        });
        await pages.updateOne(
          { _id: page._id },
          { $set: { layoutAttachments: attachments } },
        );
      }
    }
    migrated.push({
      kind,
      resourceId,
      attachmentMode: dryRun ? 'would attach' : 'attached',
      pagesToBackfill: pagesToBackfill.length,
    });
  }
  return { items: migrated, conflicts, skipped };
}

const client = new MongoClient(mongoUri);
await client.connect();
try {
  const databases = await tenantDatabases(client);
  if (databases.length === 0) {
    process.stdout.write('No tenant databases found. Nothing to migrate.\n');
  }
  for (const databaseName of databases) {
    const database = client.db(databaseName);
    const sites = await database
      .collection('sites')
      .find({
        $or: [
          { 'globalsDraft.header': { $exists: true } },
          { 'globalsDraft.footer': { $exists: true } },
          { 'publishedGlobals.header': { $exists: true } },
          { 'publishedGlobals.footer': { $exists: true } },
        ],
      })
      .toArray();
    let migratedCount = 0;
    let pagesToBackfill = 0;
    let conflicts = 0;
    let skipped = 0;
    for (const site of sites) {
      const result = await migrateSite(database, site);
      conflicts += result.conflicts;
      skipped += result.skipped;
      if (result.items.length > 0) {
        migratedCount += result.items.length;
        pagesToBackfill += result.items.reduce(
          (total, item) => total + item.pagesToBackfill,
          0,
        );
        process.stdout.write(
          `${dryRun ? '[dry-run] ' : ''}${databaseName}: ${site._id} → ${result.items.map((item) => `${item.kind} (${item.pagesToBackfill} page attachment(s))`).join(', ')}\n`,
        );
      }
    }
    process.stdout.write(
      `${dryRun ? '[dry-run] ' : ''}${databaseName}: sites scanned ${sites.length}; ${migratedCount} legacy layout resource(s) ${dryRun ? 'would be migrated' : 'migrated'}; ${pagesToBackfill} page attachment(s) ${dryRun ? 'would be backfilled' : 'backfilled'}; conflicts ${conflicts}; skipped ${skipped}.\n`,
    );
  }
} finally {
  await client.close();
}
