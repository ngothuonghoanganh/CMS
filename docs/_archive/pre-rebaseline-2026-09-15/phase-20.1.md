# Phase 20.1 — Dynamic Data Hardening & No-Code Completion

Phase 20.1 completes the no-code collection workflow and hardens the runtime
boundaries introduced in Phase 20.

## Runtime and persistence

- Dynamic pages persist `pathPattern` and the derived `dynamicBasePath`; they do
  not persist a static `path` or `slug`.
- Public route resolution uses the indexed `{workspaceId, siteId,
dynamicBasePath}` lookup and then validates the full pattern. It never scans a
  bounded list of dynamic pages.
- Collection entries keep draft and published value projections, search text,
  auto-slug provenance, and unique-value tokens on the entry row. Listing and
  query pagination, search, filtering, and sorting are performed by MongoDB.
- Unique fields are protected by both a preflight check and a partial unique
  index. Duplicate-key races are returned as structured 409 conflicts.
- Publishing revalidates the latest collection schema. Discarding an entry that
  has never been published deletes its versions and entry row, so no zombie
  draft remains.

## No-code CMS

The Collections view uses drawers for schema and entry editing. It provides
typed controls for primitive fields, select/multi-select options, references,
asset/image suggestions, field UI metadata, validation, indexing, uniqueness,
and deterministic slug configuration. Structured array/group values remain
available through the Advanced JSON editor.

Pages can be created as dynamic collection pages from the page drawer. The
drawer exposes collection, path pattern, lookup field, and a draft preview-entry
selector. The builder and renderer preserve that entry selection for review and
preview. The Inspector shares the API operator matrix and exposes current-entry
field bindings on dynamic pages.

SEO settings support current-entry bindings for title, description, Open Graph,
and Twitter fields. Bindings are checked against active fields and image values
are restricted to safe metadata URLs at validation and delivery time.

## Migration and canonical data

Run the migration in dry-run mode first:

```bash
pnpm exec node scripts/phase-20.1-backfill.mjs --dry-run
pnpm exec node scripts/phase-20.1-backfill.mjs --tenant <tenant-id> --apply
```

The script backfills stable field IDs, dynamic route bases, entry projections,
search text, uniqueness tokens, and auto-slug provenance. It never deletes
tenants or content. The canonical environment is the single active tenant
`E2E Development`.

## Validation

The repository gates are:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright test
```

The browser journey should verify the real Collections drawer, server-side
entry search/pagination, entry editing, dynamic page metadata, selected preview
entry, and the public collection-backed page.
