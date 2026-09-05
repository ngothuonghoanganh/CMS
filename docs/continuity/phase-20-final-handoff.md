# Phase 20 final handoff

Status: IMPLEMENTED — FULL BROWSER GATE BLOCKED BY OUT-OF-SCOPE FAILURES

Phase 20 adds tenant-scoped Collections, immutable entry versions, a finite
query DSL, declarative PageBinding, Collection List rendering, and Dynamic Page
routes while preserving the Phase 19 page/layout/template/published-bundle
architecture. The scoped Phase 20 browser journeys pass, but the complete
repository Playwright suite still has seven failures outside that journey.

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
shared contracts package. The Phase 20 browser journeys also pass:

```text
pnpm format:check                         PASS
pnpm lint                                 PASS
pnpm typecheck                            PASS
pnpm check:cms-design-system              PASS
pnpm test                                 PASS (contracts 47, API 65 passed/12 skipped,
                                             CMS 114, renderer 22)
pnpm build                                PASS
pnpm exec playwright test                 FAIL (74 passed, 7 failed)
  tests/e2e/collections-dynamic-data.spec.ts PASS
  tests/e2e/phase-20.1-browser.spec.ts       PASS
```

The seven full-suite failures are recorded in
`docs/phase-20-completion-audit.md`: control-plane admin login, the missing
`parity-extension` fixture, a duplicate site-name locator, three existing
GrapesJS drag/debug assertions, and custom-domain verification. They prevent a
repository-wide browser PASS but do not fail the Phase 20 journeys.

## Follow-up

Array/group values retain an Advanced JSON editor until a nested structured
field editor exists. Asset browsing is bounded to the loaded workspace result
set and has no bulk operation. Sitemap enumeration, external data providers,
cache invalidation, formulas, and interactive public pagination are deliberately
out of scope for this phase.
