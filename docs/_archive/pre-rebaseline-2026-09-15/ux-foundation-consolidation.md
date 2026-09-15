# UX foundation consolidation

This document records the ownership boundary shipped before Phase 22.

## Ownership

- Navigation content is Builder-owned `navigation-view.props.items`. The item
  tree is bounded to 1,000 nodes and 256 KB, validates internal page/anchor
  targets server-side, and renders recursively with keyboard-accessible mobile
  controls. `source` and the site navigation resource API are compatibility
  fields only.
- Collections and entries are workspace-owned. The canonical API is
  `/workspaces/:workspaceId/collections`; the former
  `/workspaces/:workspaceId/sites/:siteId/collections` route remains during
  migration and emits legacy site ownership when present.
- A collection field may be `editable` or `constant`. Constant values are
  written by the schema and overwrite entry input. Conditional visibility is a
  finite `all`/`any` rule set with typed operators; missing fields, invalid
  operators, self-dependencies, and dependency cycles are rejected.
- The workspace Design System owns published defaults and component appearance
  defaults. A site-level Design System is a compatibility override. Public
  delivery reads published workspace values only, with a site override taking
  precedence.
- Assets are workspace-owned metadata plus a storage-provider boundary. The
  default provider stores bytes below `ASSET_STORAGE_ROOT`; upload returns a
  stable asset id/public URL. Folders are workspace-owned and cannot be deleted
  while they contain child folders or assets.

## APIs and UI

The CMS primary sidebar exposes Collections, Assets, and the workspace Design
System. Navigation is edited from the selected Builder component. Collections
support canonical workspace routes, schema field ownership/conditions, and
Form/JSON entry editing. Assets support multipart upload, MIME/size limits,
folder assignment, folder creation, usage-aware deletion, and metadata-only
legacy records.

Existing site-prefixed routes and data are intentionally retained while the
migration is observed. They should not be linked from new CMS navigation.

## Migration

Run the idempotent, dry-run-first migration per tenant:

```sh
pnpm exec node scripts/migrate-ux-foundation.mjs --dry-run
pnpm exec node scripts/migrate-ux-foundation.mjs --database <tenant-db> --apply
```

The migration reports duplicate workspace keys and resolves them with stable
site/id-derived suffixes. Collection ids and entry/version references are
preserved. Legacy Navigation rows are never rewritten or deleted: deterministic
workspace-owned copies are created with `migrationSourceId`, so the existing
public site resolver continues to work during the compatibility window and a
rerun is idempotent. Apply writes a `running`/`complete` marker (or `failed`
with the error) in `tenantMigrations`; dry-run never writes. It copies a full
legacy site Design System into an empty workspace Design System when it can do
so safely, and reports sparse values requiring normalization. After the
compatibility window is closed, remove legacy indexes/routes only after a fresh
dry-run reports zero legacy rows and all published pages pass publish-readiness
checks.

## Intentional limitations

The local provider is a production-shaped default, not a managed object store;
deployments should bind the storage interface to S3/R2/GCS. Uploaded bytes are
sniffed for common media signatures and storage cleanup failures are logged with
a retryable API signal. Inline Builder page targets are validated in page,
layout, template, and reusable documents; public page target URL resolution
continues to use the published navigation projection for legacy resources.
