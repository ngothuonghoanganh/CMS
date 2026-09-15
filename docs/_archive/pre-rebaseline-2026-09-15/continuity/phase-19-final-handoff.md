# Phase 19 final handoff

Status: COMPLETE

## Delivered

- Canonical menu-only Navigation domain.
- Independent Header/Footer layout resources, version history, duplicate,
  discard, publish and explicit page attachment/placement.
- Shared document-kind-aware Page/Layout/Template Builder surfaces.
- Versioned Templates with immutable snapshots, publish, restore-as-new-version,
  clone-on-apply provenance and in-use delete protection.
- Runtime dependency validation for menus, reusables, design tokens and custom
  visual extensions.
- Idempotent legacy globals migration with dry-run reporting.
- Renderer preview/live separation and published-only public resolution.
- Phase 19 Playwright coverage for lifecycle, parity, placement, custom
  extension and template journeys.

## Important routes

```text
GET/PATCH /pages/:pageId/layout
CRUD      /sites/:siteId/layouts/:kind
POST      /sites/:siteId/layouts/:kind/:resourceId/{duplicate,publish,discard}
CRUD      /workspaces/:workspaceId/templates
POST      /workspaces/:workspaceId/templates/:templateId/{publish,apply}
```

CMS builder routes:

```text
/workspaces/:workspaceId/sites/:siteId/layouts/:kind/:layoutId/builder
/workspaces/:workspaceId/sites/:siteId/templates/:templateId/builder
```

## Validation record

Run the repository gates from the project root:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec node scripts/migrate-legacy-layout-globals.mjs --help
pnpm exec playwright test tests/e2e/layout-extensions.spec.ts
```

The focused Phase 19 Playwright suite passes when run against a fresh E2E
organization/site. The pre-existing canonical E2E site can be blocked by its
10-page plan quota; that is test-fixture state, not a product failure. The
repository currently reports a Node engine warning because the environment is
Node 22 while the package recommends Node 24 or newer.

## Operational notes

Run the migration with `--dry-run` first and review its site/resource/page
counts, conflicts and skipped records. Use `--apply` only after confirming the
target tenant/database. Existing explicit page attachments are preserved. Public
pages never read mutable draft layout state.
