# Phase 18 continuity handoff

## Delivered

- `ReusableComponentDocument` and `PagePayloadV7` contracts with tree limits,
  style capability validation, nested-reuse rejection, and stable IDs.
- Tenant-scoped reusable CRUD, usage, archive semantics, draft source storage,
  and site-publish source snapshots.
- Public and Builder draft dependency resolution with batched reusable queries.
- Shared site design-system contract/resolver, draft/published persistence,
  token usage discovery, deletion safety, and publish validation.
- Builder Saved/Template catalog tabs, source-derived previews, linked preview
  descendants, copy/link insertion, save-as-reusable dialog, and detach command.
- Renderer support for V7 literal/token styles and cycle-safe reusable source
  rendering.

## Important invariants

- A persisted linked instance is a leaf: `{ id, type: 'reusable-instance',
props: { reusableId }, style? }`.
- Resolved source descendants are editor-only and are omitted by the serializer.
- Copy and detach use the existing identity service, and GrapesJS owns history.
- V1–V6 payloads and SiteGlobals remain backward compatible.
- Production receives published page/global/navigation/reusable/design-system
  snapshots only.

## Validation

The current workspace passes formatting, lint, typecheck, unit/integration tests,
and production build on Node 22.19.0 (the repository declares Node `>=24`, so
the same checks should be repeated under the supported runtime before release).
The full Playwright suite passes 60 of 62 tests, including the Phase 18
reusable-source flow. Two pre-existing failures remain reproducible:

- `tests/e2e/api.spec.ts:326` receives `409` instead of `201` while disabling
  the published extension dependency.
- `tests/e2e/builder-renderer-parity.spec.ts:501` reports a desktop screenshot
  mismatch of `55` against a threshold of `8`.

## Follow-up risk

Saved cards now open the reusable source in the existing Builder session using
a temporary valid page envelope; the wrapper is removed before the source is
saved. Preview dependency context is loaded with the preview request and is not
re-fetched when a source changes in another tab. Cross-site migration and source
version pinning are intentionally not part of Phase 18.
