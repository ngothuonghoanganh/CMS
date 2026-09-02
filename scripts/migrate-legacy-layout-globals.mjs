import { createHash } from 'node:crypto';
import process from 'node:process';

import { MongoClient } from 'mongodb';

const args = new Set(process.argv.slice(2));
const readOption = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const apply = args.has('--apply');
const dryRun = !apply || args.has('--dry-run');
const selectedDatabase = readOption('--database');
const selectedTenantId = readOption('--tenant');
const mongoUri = process.env.MONGODB_URI;
const masterDatabaseName =
  process.env.MONGODB_MASTER_DATABASE_NAME ?? 'payload_platform_master';

if (!mongoUri) {
  throw new Error(
    'MONGODB_URI is required. Load the project .env file before running this script.',
  );
}

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

function uuidFor(seed) {
  const hex = createHash('sha256').update(seed).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function legacyDocument(value, kind) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const document = clone(value);
  const expectedDocumentKind = kind === 'header' ? 'site-header' : 'site-footer';
  if (
    document.version !== 1 ||
    document.documentKind !== expectedDocumentKind ||
    !document.root ||
    typeof document.root !== 'object' ||
    !Array.isArray(document.root.children)
  ) {
    return null;
  }
  return document;
}

function legacyGlobal(site, source, kind) {
  const globals = source === 'draft' ? site.globalsDraft : site.publishedGlobals;
  return legacyDocument(globals?.[kind], kind);
}

function layoutSlot(kind) {
  return kind === 'header' ? 'page.header.top' : 'page.footer.bottom';
}

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

  for (const kind of ['header', 'footer']) {
    const draft = legacyGlobal(site, 'draft', kind);
    const published = legacyGlobal(site, 'published', kind);
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
      const pagesForSite = await pages
        .find({ siteId: site._id, workspaceId: site.workspaceId })
        .project({ _id: 1, layoutAttachments: 1 })
        .toArray();
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
    });
  }
  return migrated;
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
    for (const site of sites) {
      const migrated = await migrateSite(database, site);
      if (migrated.length > 0) {
        migratedCount += migrated.length;
        process.stdout.write(
          `${dryRun ? '[dry-run] ' : ''}${databaseName}: ${site._id} → ${migrated.map((item) => item.kind).join(', ')}\n`,
        );
      }
    }
    process.stdout.write(
      `${dryRun ? '[dry-run] ' : ''}${databaseName}: ${migratedCount} legacy layout resource(s) ${dryRun ? 'would be migrated' : 'migrated'}.\n`,
    );
  }
} finally {
  await client.close();
}
