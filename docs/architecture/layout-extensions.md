# Layout Extensions (Header / Footer)

Header and Footer are independent, buildable **layout extension resources**. They
share the Page Builder engine (GrapesJS, Layers, Inspector, responsive controls,
design tokens, undo/redo, validation) but own their own draft/published
lifecycle. They are managed from the Extensions screen and can be dragged into a
page as blocks. The page stores a fresh copy of the component tree, so changing
the source extension never mutates an existing page snapshot.

## Invariants

- Menu is data. Header is layout.
- A page without a copied Header block has no Header (legacy attachments remain
  supported for existing pages).
- A page without a copied Footer block has no Footer (legacy attachments remain
  supported for existing pages).
- Header draft never affects public pages until Header publish.
- Footer draft never affects public pages until Footer publish.
- Publishing a source Header/Footer updates only legacy attachment references;
  copied page blocks are independent and require an explicit page edit to change.

## Resource model

```ts
type LayoutExtensionResource = {
  id: string;
  workspaceId: string;
  siteId: string;
  kind: 'header' | 'footer';
  name: string;
  description?: string;
  draftVersionId?: string;
  publishedVersionId?: string;
  createdAt: string;
  updatedAt: string;
};

type LayoutExtensionVersion = {
  id: string;
  resourceId: string;
  versionNumber: number;
  document: SiteGlobalPayloadV1; // documentKind: 'site-header' | 'site-footer'
  status: 'draft' | 'published' | 'archived';
  createdAt: string;
  createdBy?: string;
};
```

The document body is the existing `SiteGlobalPayloadV1` shape: a `root` whose
single child is `global-header` or `global-footer`. Inside that node the user
composes `site-brand`, `navigation-view`, `button`, `link`, `text`, `heading`.

## Draft + publish

- Saving a draft creates a new immutable version, advances `draftVersionId`, and
  archives the previous draft snapshot.
- Publishing validates design-token, reusable, menu and extension references,
  marks the selected draft version `published`, moves `publishedVersionId` to it,
  and clears `draftVersionId`.
- Discarding archives the current draft version and clears `draftVersionId`,
  reverting preview to the published version.
- Published versions are immutable.

The dedicated builder's `Review draft` action reloads the persisted draft version
from the API and remounts the editor from that snapshot. Unsaved canvas state is
never presented as Review. `Live preview` uses the page preview boundary when the
layout is opened from a page; public delivery still resolves the published
version only.

## API

```
GET    /sites/:siteId/layouts/:kind
POST   /sites/:siteId/layouts/:kind
GET    /sites/:siteId/layouts/:kind/:resourceId
PATCH  /sites/:siteId/layouts/:kind/:resourceId
POST   /sites/:siteId/layouts/:kind/:resourceId/publish
POST   /sites/:siteId/layouts/:kind/:resourceId/duplicate
POST   /sites/:siteId/layouts/:kind/:resourceId/discard
GET    /sites/:siteId/layouts/:kind/:resourceId/versions
DELETE /sites/:siteId/layouts/:kind/:resourceId
```

where `:kind` is `headers` or `footers`.

## Legacy migration

There is no runtime fallback for `Site.globalsDraft.header/footer` or
`publishedGlobals.header/footer`. Migrate old data before deploying this change:

```bash
# Reports every change without writing.
pnpm exec node scripts/migrate-legacy-layout-globals.mjs --dry-run

# Applies the idempotent migration after reviewing the dry run.
pnpm exec node scripts/migrate-legacy-layout-globals.mjs --apply
```

The migration creates deterministic Header/Footer resources and versions, then
attaches each resource to pages that do not already have an explicit attachment
of that type. Existing page layout choices are never overwritten. Use
`--database <tenant-db>` or `--tenant <tenant-id>` to target one tenant.

## Renderer

The renderer exposes `renderLayoutExtension(document, context)` for legacy
attachment rendering. New copied `global-header`/`global-footer` nodes are
rendered directly by `renderPage(payload)`; there is no automatic fallback.
