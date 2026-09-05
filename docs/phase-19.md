# Phase 19 — Layout Extensions, Menu Domain and Template Authoring

Status: COMPLETE

Phase 19 separates menu data from page chrome, makes Header/Footer independent
layout resources, and brings Templates to the same authoring and publishing
model as Pages.

## Delivered architecture

- Navigation stores one canonical `items` collection. Menu validation and
  `navigation-view` binding remain; menu publish state and automatic site-wide
  rendering do not.
- Header and Footer are `LayoutExtensionResource` records with immutable
  `LayoutExtensionVersion` snapshots and independent draft/published pointers.
- Pages store explicit `PageLayoutAttachment` records with enabled state and
  page placement. No attachment means no global chrome.
- The Page Builder engine is reused for `site-header`, `site-footer` and
  `page` document kinds. The CMS exposes dedicated layout and template builder
  routes with Layers, Inspector, responsive controls, assets, design tokens,
  undo/redo and save conflict handling.
- Templates contain immutable version snapshots of `PagePayload` and layout
  attachments. Apply deep-clones the snapshot into a new Page and records
  provenance without creating a live link.
- Layout resources use `layout.read/create/update/publish/delete` and Templates
  use `template.read/create/update/publish/delete`; publish actions are not
  authorized through `page.publish`.

## API surfaces

```text
/workspaces/:workspaceId/layouts/headers|footers
/sites/:siteId/layouts/headers|footers
/sites/:siteId/pages/:pageId/layout
/workspaces/:workspaceId/templates
/workspaces/:workspaceId/sites/:siteId/templates/:templateId/builder
```

Layout resources support create, update, duplicate, versions, publish,
discard and delete. They are owned by the workspace and can be attached to
pages from any site in that workspace. The site-scoped layout routes remain as
backward-compatible aliases. Templates support create, update, versions,
publish, apply, restore-as-new-version and delete protection while referenced
by pages. All management routes enforce existing workspace/page/template
permissions and audit successful mutations.

## Persistence and publishing rules

Every visual save creates an immutable version and advances the draft pointer;
the previous draft is archived. `expectedVersionNumber` prevents silent lost
updates. Preview resolves the persisted draft; public delivery resolves only
published page/layout snapshots. Publishing a referenced Header/Footer changes
the resolved chrome for attached pages without republishing the page.

Layout documents validate reusable and enabled extension dependencies before a
workspace-wide publish. Site-specific navigation and design-token references
are resolved in the target page/site context. Templates validate the same
dependencies and published layout references before publish/apply.

## Migration

Legacy `Site.globalsDraft.header/footer` and `publishedGlobals.header/footer`
are migrated by:

```bash
pnpm exec node scripts/migrate-legacy-layout-globals.mjs --dry-run
pnpm exec node scripts/migrate-legacy-layout-globals.mjs --apply
```

The command is dry-run by default, supports `--database`/`--tenant`, uses
deterministic resource/version/attachment IDs, preserves explicit page layout
choices, is safe to rerun, and reports conflicts/skipped malformed legacy
documents. The old globals endpoint remains only for site-wide social metadata;
it no longer owns Header/Footer documents.

## Verification

The Phase 19 Playwright suite covers:

1. Header lifecycle and attached public rendering.
2. Footer lifecycle and attached public rendering.
3. Template Builder save/publish/version history.
4. Template apply clone and provenance behavior.
5. Draft preview versus published public output.
6. No implicit layout plus explicit slot placement.
7. Custom extension persistence in both Header and Footer documents.

See [`continuity/phase-19-final-handoff.md`](continuity/phase-19-final-handoff.md)
for the final command results and known environment limitations.
