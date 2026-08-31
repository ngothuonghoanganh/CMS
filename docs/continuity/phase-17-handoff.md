# Phase 17 Handoff — Site Globals & Navigation Presentation

Read [`phase-17.md`](../phase-17.md) for the implementation report.

## Source-of-truth boundaries

- Site Navigation owns what links exist.
- `navigation-view` owns only how canonical navigation is presented; it never
  stores a links array.
- Site metadata owns branding; `site-brand` references it from the renderer
  context.
- Page payloads own page content only.
- Header and footer are independent site-global documents, not page children.
- Public delivery reads `publishedGlobals`, never `globalsDraft`.

## Data and publishing

`SiteGlobalsSchema` is version 1 and contains draft/published global regions.
`SiteGlobalPayloadV1Schema` validates `documentKind`, exactly one matching
global root child, shared PageNode relationships, slot cardinality and V6
responsive/component-part styles. Missing legacy globals resolve to a safe
default/fallback instead of requiring migration.

The management routes are:

```text
GET   /workspaces/:workspaceId/sites/:siteId/globals
PATCH /workspaces/:workspaceId/sites/:siteId/globals
POST  /workspaces/:workspaceId/sites/:siteId/publish
```

The first two are workspace/site scoped and permission protected. Site publish
validates the site, snapshots the parsed draft globals and makes that snapshot
available to the public resolver. Page publication remains independently
versioned; public composition uses the published page plus the published site
snapshot.

## Builder context

`BuilderShell` maintains isolated page, header and footer documents. It reuses
the same GrapesJS adapter, registry-filtered palette, Inspector, Structure
Editor, command engine and UndoManager. Global presets are composition helpers;
global roots themselves are not insertable palette components. Page mode shows
locked global previews, and global mode keeps the surrounding site chrome
non-editable.

Registry `documentKinds` controls palette exposure and global component
placement. Older registry entries without that optional runtime field are
normalized to page context for compatibility.

## Renderer behavior

The renderer receives a resolved site context containing navigation, site
branding and published globals. `NavigationView` resolves `main`/`footer`
navigation by canonical role, emits active `aria-current`, and supports nested
items. Collapse mode supplies accessible toggle state, controlled panel IDs,
Escape close and focus return. Global component parts and responsive styles are
rendered through the same finite style vocabulary as page components.

## Validation

Node `v24.11.0`, pnpm `10.15.0`:

- Contracts/CMS/Renderer/API tests — PASS: 36, 76, 16, and 47 passed / 12
  skipped
- format, lint, typecheck and build — PASS
- Phase15 + Phase16 + Phase17 focused E2E — PASS: 7/7
- Phase17 E2E — PASS: global switching, preset composition, save/reload,
  scoped API access, site publish and public global rendering
- Full E2E — 56/58 passed. Remaining failures are unchanged baseline debt:
  tenant extension disable (`409` vs expected `201`) and screenshot parity (65
  vs threshold 8).

Starting HEAD was `747d47cdfb394ccc807ea5f9a0fe53b223d934cd`; no commit was
created, so the final implementation is in the working tree.

## Next phase guidance

Do not introduce a second navigation data model when extending global
presentation. Any future local navbar, dropdown or mega-menu work should first
define its scope and accessibility contract without weakening the Navigation
domain boundary. Phase 18 may proceed after the two baseline E2E failures are
accepted or resolved by the release owner.
