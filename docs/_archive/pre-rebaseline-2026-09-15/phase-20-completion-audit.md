# Phase 20 completion audit

## Closure provenance

Starting HEAD: `b26886448750e24b385dad8365ae761147728c89`

The closure pass was performed against the audited commit named above. The
repository was already a working tree with user changes, so no commit was
created by this pass; the ending HEAD remains the same SHA.

## Audit findings

The source audit found several gaps behind the previous `COMPLETE` handoff:

- Collection entry editing was effectively a raw JSON workflow, including for
  scalar, date, boolean, select, asset, and reference fields.
- Asset and reference values had no normal picker flow, no stale-resource UX,
  and no bounded search surface in the entry editor.
- Collection and entry identity was duplicated in local CMS selection state
  instead of being derived consistently from canonical route parameters.
- Collection permissions were coupled in the page view, and asset loading had
  no independent loading/error state.
- Collection contracts did not reject reserved or duplicate field keys,
  incompatible defaults, or reserved dynamic route bases.
- Date query operators and structured-field sorting were not aligned with the
  finite query DSL.
- Binding validation could accept query sources without a source ID, and the
  builder could fabricate query source IDs instead of requiring a configured
  collection query.
- Runtime asset references were persisted as IDs but were not consistently
  hydrated to authorized storage keys for delivery.
- Entry discard/version transitions needed conditional pointer checks to avoid
  silently losing a concurrent update.
- CMS leaf routes repeated `CmsShell` ownership rather than using the workspace
  layout as the single shell boundary.
- The asset list API lacked bounded search/media-type query handling.

The audit also confirmed that Phase 19 composition, layout, template, extension,
tenant, and published-bundle invariants must remain unchanged.

## Finding disposition

| Finding                                                               | Disposition   | Evidence and closure action                                                                                                                   |
| --------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Builder routes were nested under `CmsShell`                           | CONFIRMED     | Added the explicit workspace route boundary and browser assertions for page, layout, and template builders.                                   |
| Page Builder leave returned to `/`                                    | CONFIRMED     | Leave now returns to the canonical page detail route, with dirty-leave confirmation coverage.                                                 |
| Layout/Template builder return paths were not canonical               | CONFIRMED     | Layout builders return to the page or Extensions owner; Template Builder returns to the template route.                                       |
| Root and login were alternate CMS entry points                        | CONFIRMED     | `/` is bootstrap/legacy-bookmark redirect only; login uses the returned session workspace directly.                                           |
| Collections preloaded a bounded asset slice                           | CONFIRMED     | AssetPicker owns debounced server search, media filtering, selected lookup, and pagination; CollectionsPage no longer preloads assets.        |
| Entry state was one JSON string                                       | CONFIRMED     | Semantic controls now edit an `EntryDraft` object; array/group JSON is field-scoped.                                                          |
| Reference selection needed large-collection and stale-target handling | CONFIRMED     | ReferencePicker uses server pagination/search and explicit unavailable/archived/missing-target states.                                        |
| Phase 20 runtime, contract, and concurrency gaps                      | ALREADY FIXED | Existing Phase 20 implementation and focused contract/API/renderer suites cover these invariants; no regression was found in the closure run. |

## Architecture changes

- `CmsShell` is mounted once in
  `apps/cms/app/workspaces/[workspaceId]/layout.tsx`; workspace leaf routes render
  their feature page directly beneath it.
- Collection identity, entry identity, save/cancel navigation, and deep-link
  loading are route-owned. Feature state is no longer a second navigation
  source of truth.
- Collection fields are generated from shared contract metadata through a
  colocated Collections control module. Structured array/group fields retain a
  bounded Advanced JSON editor; semantic scalar fields do not require JSON.
- Asset selection is workspace-scoped, permission-aware, bounded, searchable,
  media-type filterable, and persists only an asset ID. Reference selection is
  site/collection-scoped, searchable, bounded, and persists entry IDs.
- Runtime collection resolution batches referenced assets and maps them to
  storage keys without fetching each asset as an N+1 operation.

## Files/components moved

- Added `apps/cms/app/collections/collection-field-controls.tsx` for semantic
  field mapping, `AssetPicker`, `ReferencePicker`, and generated entry fields.
- Added `apps/cms/app/workspaces/[workspaceId]/layout.tsx` as the shell ownership
  boundary.
- Removed the old feature wrapper usage from the workspace leaf routes; the
  route files now directly render their feature modules.
- Kept shared modal/drawer primitives shared and improved portal, focus restore,
  Escape, and scrollbar handling without moving collection business logic into
  shared UI.

## Contracts changed

- Added reserved collection field-key validation and duplicate-key checks.
- Added title-field existence checks and compatible-default validation.
- Added asset MIME/file-size definition validation and UUID/reference checks.
- Restricted date/datetime query operators to supported range/set operators and
  rejected structured sorting.
- Reserved public route bases are rejected by dynamic path validation.
- Query bindings require `sourceId` for query and query-item sources.
- Added bounded `AssetListQuerySchema` with search and media-type filters.

## API changes

- Collection list/get/usage and runtime collection operations require the
  resolved workspace/site/collection scope.
- Entry version updates and draft discard use conditional pointer checks and
  return explicit conflict errors for races.
- Asset validation checks UUID references, workspace ownership, allowed MIME
  types, and maximum size; image fields accept validated safe URLs or asset IDs.
- Runtime records batch asset lookups and expose storage keys only for authorized
  assets. Ambiguous published dynamic lookups return no arbitrary entry.
- Composition validation checks query IDs, collection-list query sources,
  bindable targets, source collections, field paths, and current-entry scope.
- Asset list search is escaped, bounded, workspace-scoped, and permission-aware.
- Collection schema updates emit the appropriate schema/update audit action.

## CMS changes

- Added canonical Collections, schema, entries, new-entry, detail, and edit
  route flows with refresh/deep-link support.
- Added generated controls for text, long text/rich text, number, boolean, date,
  datetime, select, multi-select, URL, email, slug, image/asset, and reference
  fields. Array/group remain structured JSON by design.
- Added asset current preview/change/remove/stale states and reference
  search/select/remove/stale states with loading, empty, error, and missing-target
  handling.
- Added schema editor controls for title field, defaults, descriptions,
  placeholders, reorder, validation ranges, options, MIME restrictions, and
  file-size limits.
- Added route-correct Save draft, Publish, Edit, Cancel, and archive behavior;
  optimistic conflict errors remain distinct from generic failures.
- Added responsive picker, schema, and entry-editor styles and retained shared
  accessible modal focus behavior.

## Builder changes

- Collection List query editing exposes bounded collection, limit, filters, and
  sort controls from the contract DSL.
- Binding source labels expose collection query and query-item concepts, and the
  UI refuses to create a binding without a configured collection query.
- Filter values normalize `in`/`notIn` as arrays and sort fields exclude
  unsupported array/group/multi-select fields.
- Collection List continues to persist one `collection-item` template while
  runtime preview repeats rows.

## Renderer changes

- Review resolves persisted draft composition and draft entry state.
- Public SSR resolves published composition and published entry pointers only;
  it never falls back to drafts.
- Collection data and dynamic detail routes use bounded validated queries,
  deterministic bindings, published lookup entries, and graceful missing-data
  behavior.
- Asset references are resolved to delivery storage keys in the bounded runtime
  context.

## Tests added

- `packages/contracts/src/collections.spec.ts`: reserved/duplicate keys,
  incompatible defaults, and dynamic route safety.
- `packages/contracts/src/data-runtime.spec.ts`: query binding source IDs.
- `apps/api/src/domain/collection.service.spec.ts`: date query operators and
  structured sort rejection.
- `apps/cms/app/collections/collection-field-controls.spec.ts`: semantic control
  mapping, asset filtering, and reference normalization.
- Existing renderer, data-runtime, builder, and Phase 19 suites were run as
  compatibility coverage.
- `tests/e2e/collections-dynamic-data.spec.ts` and
  `tests/e2e/phase-20.1-browser.spec.ts` both pass, covering collection data,
  filtered list resolution, dynamic pages, CMS schema/entry routing, and
  draft/public separation.
- `tests/e2e/phase-20-pickers.spec.ts` covers a real UI asset search outside the
  first page, one and many reference selection, draft save, and reload.
- `tests/e2e/cms-routing-root.spec.ts` covers authenticated root bootstrap,
  legacy root bookmark conversion, and direct login-to-workspace navigation.

## Explicit Phase 20 checklist

### Contracts

- [x] Collection schema validated
- [x] Entry schema and values validated
- [x] Query bounded
- [x] Bindings safe and validated
- [x] Dynamic path validated

### API

- [x] Collection CRUD
- [x] Entry CRUD
- [x] Immutable versioning
- [x] Publish
- [x] Optimistic concurrency
- [x] Ownership
- [x] RBAC/permission enforcement
- [x] Audit events

### CMS

- [x] Collections routes
- [x] Collection detail
- [x] Schema editor
- [x] Entry list
- [x] Entry create
- [x] Entry detail
- [x] Entry edit
- [x] Semantic fields
- [x] Asset picker
- [x] Reference picker

### Builder

- [x] Collection List
- [x] Query editor
- [x] Binding editor
- [x] Save/reload persistence
- [x] Preview/review data path

### Renderer

- [x] List rendering
- [x] Dynamic page resolution
- [x] Published-only public behavior

### Browser and quality

- [x] Phase 20 direct CMS routes
- [x] Phase 20 refresh/deep-link journey
- [x] Phase 20 save/navigation journey
- [x] Phase 20 collection list/dynamic route journey
- [x] Phase 20 draft/public separation
- [x] Page/layout/template builders bypass the CMS shell
- [x] Builder leave returns to canonical resource routes
- [x] Asset and reference picker browser journey, including first-page search regression
- [x] CMS design-system guardrail
- [x] Responsive builder/browser coverage at 1440, 1280, 1024, 768, and 390
- [x] Full repository Playwright suite is green

## Known remaining limitations

These are intentional Phase 20 boundaries:

- Array/group fields use Advanced JSON rather than a complete nested field
  builder.
- Asset and reference pickers use bounded server pages and have no bulk operation.
- Sitemap enumeration, external providers, GraphQL/SQL data sources, formulas,
  large cache infrastructure, AI binding, collaboration, approval workflows,
  marketplace, A/B testing, and interactive public pagination remain out of
  scope.

## Previously reported Playwright failures

All seven failures from the prior audit were reproduced and closed without
skipping or weakening assertions:

| Failure                                             | Classification | Root cause and fix                                                                                                                                                                     |
| --------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `billing.spec.ts` admin login                       | FIXTURE        | The test supplied a hard-coded `demo` tenant slug instead of allowing the server-selected admin context; the request now uses the canonical admin login contract.                      |
| `builder-renderer-parity.spec.ts` missing extension | FIXTURE        | The fixture referenced an unregistered extension ID; it now uses the enabled `DemoBuilder` registry ID.                                                                                |
| `cms.spec.ts` site-name ambiguity                   | STALE TEST     | The new site flow lands on a detail route, so generic text matched both heading and summary; the assertion now targets the exact heading.                                              |
| `cms.spec.ts` true block drag                       | ALREADY FIXED  | The Phase 19 drag-intent/editor mutation path was already present in the working tree; full browser coverage passes.                                                                   |
| `cms.spec.ts` valid-container reorder               | ALREADY FIXED  | The real-pointer cross-container path and payload synchronization were already present; full browser coverage passes.                                                                  |
| `domains-seo.spec.ts` verification                  | ENVIRONMENT    | A reused API process lacked the fake verification/trust-proxy settings; the Playwright server configuration was started fresh with the deterministic providers and the journey passes. |
| `layout-extensions.spec.ts` debug payload           | ALREADY FIXED  | The current builder debug surface and layout fixture are available; the focused and full layout suites pass.                                                                           |

The full run also exposed stale tenancy assertions after the canonical route
change and a preview identity collision for repeated layout resources. Those
were corrected in the test expectations and by including the preview variant
in the fingerprint; they are now covered by the green full run.

## Validation results

```text
pnpm format:check                         PASS
pnpm lint                                 PASS
pnpm typecheck                            PASS
pnpm check:cms-design-system              PASS
pnpm test                                 PASS (contracts 47, API 65 passed/12 skipped,
                                             CMS 118, renderer 22)
pnpm build                                PASS
pnpm exec playwright test                  PASS (87 passed)
pnpm exec playwright test tests/e2e/phase-20-pickers.spec.ts PASS (1 passed)
git diff --check                          PASS
```

## CI

`.github/workflows/ci.yml` now runs the CMS design-system guard and
the full Playwright suite on Node 24 with the MongoDB service. No remote GitHub Actions
run was inspected during this local closure pass, so this report makes no claim
about a hosted run status; the local gates above are the observed evidence.

## Ending HEAD

`b26886448750e24b385dad8365ae761147728c89` (same commit; closure changes remain
uncommitted in the working tree)

## Phase status

`PHASE 20: COMPLETE`
