# Phase 20 final handoff

Status: COMPLETE

Phase 20 adds tenant-scoped Collections, immutable entry versions, a finite
query DSL, declarative PageBinding, Collection List rendering, and Dynamic Page
routes while preserving the Phase 19 page/layout/template/published-bundle
architecture.

## Key implementation locations

- Contracts: `packages/contracts/src/collections.ts`,
  `packages/contracts/src/data-runtime.ts`, `extension-platform.ts`, and
  `index.ts`.
- API: collection persistence schemas, `apps/api/src/domain/collection.service.ts`,
  `collection.controller.ts`, page/public resolver integration, and template
  cloning.
- CMS: `apps/cms/app/collections-view.tsx`, dashboard navigation, Builder
  Inspector query/binding controls, and builder adapter collection-list support.
- Renderer: `apps/renderer/app/renderer.tsx`, preview data context, dynamic route
  resolution, and SSR-safe binding resolution.

## Invariants

1. Collection metadata is data, not executable code.
2. Entry draft versions never leak into public delivery.
3. Review reads persisted draft page and entry state.
4. Public reads published page configuration and published entry pointers.
5. Collection List persists one template, not duplicated rows.
6. Queries and bindings survive composition save/reload/publish and are remapped
   during node/template cloning.
7. Tenant, site, permission, and audit checks are server-side.

## Validation record

The focused contracts, API, CMS, and renderer suites pass after rebuilding the
shared contracts package. The full repository gates and the dedicated Phase 20
Playwright journey also pass:

```text
pnpm format:check                         PASS
pnpm lint                                 PASS
pnpm typecheck                            PASS
pnpm test                                 PASS (45 contracts, 62 API, 109 CMS, 21 renderer)
pnpm build                                PASS
E2E_API_BASE_URL=http://127.0.0.1:3011/api/v1
  pnpm exec playwright test tests/e2e/collections-dynamic-data.spec.ts PASS (1 test)
```

## Follow-up

Specialized field pickers, sitemap enumeration, external data providers,
cache invalidation, formulas, and interactive pagination are deliberately out
of scope for this phase.
