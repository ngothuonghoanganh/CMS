# Phase 20 final handoff

Status: COMPLETE — ALL LOCAL QUALITY AND BROWSER GATES PASS

Phase 20 adds tenant-scoped Collections, immutable entry versions, a finite
query DSL, declarative PageBinding, Collection List rendering, and Dynamic Page
routes while preserving the Phase 19 page/layout/template/published-bundle
architecture. The closure pass also completes canonical routing, standalone
builder boundaries, semantic entry editing, and server-backed resource pickers.

## Key implementation locations

- Contracts: `packages/contracts/src/collections.ts`,
  `packages/contracts/src/data-runtime.ts`, `extension-platform.ts`, and
  `index.ts`.
- API: collection persistence schemas, `apps/api/src/domain/collection.service.ts`,
  `collection.controller.ts`, `asset.service.ts`, page/public resolver
  integration, and template cloning.
- CMS: `apps/cms/app/collections/collections-page.tsx`,
  `collections-view.tsx`, `collection-field-controls.tsx`, workspace layout,
  and Builder Inspector query/binding controls.
- Routing: `apps/cms/app/cms-routes.ts`, the workspace layout boundary, root
  bootstrap, login redirect, and canonical builder leave paths.
- Renderer: `apps/renderer/app/renderer.tsx`, preview data context, dynamic
  route resolution, and SSR-safe binding resolution.

## Invariants

1. Collection metadata is data, not executable code.
2. Entry draft versions never leak into public delivery.
3. Review reads persisted draft page and entry state.
4. Public reads published page configuration and published entry pointers.
5. Collection List persists one template, not duplicated rows.
6. Queries and bindings survive composition save/reload/publish and are remapped
   during node/template cloning.
7. Asset and reference fields persist bounded IDs; runtime asset delivery maps
   authorized asset IDs to storage keys.
8. Tenant, site, permission, and audit checks are server-side.
9. `CmsShell` is owned once by the workspace layout; feature routes own their
   resource state and route identity.

## Validation record

The focused contracts, API, CMS, and renderer suites pass after rebuilding the
shared contracts package. The complete browser matrix and picker journey pass:

```text
pnpm format:check                         PASS
pnpm lint                                 PASS
pnpm typecheck                            PASS
pnpm check:cms-design-system              PASS
pnpm test                                 PASS (contracts 47, API 65 passed/12 skipped,
                                             CMS 118, renderer 22)
pnpm build                                PASS
pnpm exec playwright test                  PASS (87 passed)
  tests/e2e/phase-20-pickers.spec.ts          PASS
  tests/e2e/collections-dynamic-data.spec.ts PASS
  tests/e2e/phase-20.1-browser.spec.ts       PASS
```

The seven failures recorded by the previous audit were classified and closed;
their provenance and fixes are recorded in `docs/phase-20-completion-audit.md`.

## Follow-up

Array/group values retain an Advanced JSON editor until a nested structured
field editor exists. Asset and reference browsing use bounded server pages and
have no bulk operation. Sitemap enumeration, external data providers, cache
invalidation, formulas, and interactive public pagination are deliberately out
of scope for this phase.
