# Phase 21 final handoff

Status: implementation complete; local repository gates pass.

Starting HEAD: `5b8b874425ff36834552870d4b5e8fcb77f19181`.

## Delivered seams

- `page.design` capability with registry-driven content/design classification
  and server-side `PAGE_DESIGN_PERMISSION_REQUIRED` enforcement.
- Content/Design modes in the single Page Builder with content-only Inspector
  filtering and command/drag safety.
- Bounded version history, authenticated historical preview, CAS restore as a
  new draft, and rollback audit metadata.
- Source-backed publish readiness and a publish dialog with issue lists and
  change summary; publish remains authoritative and unpublish remains separate.
- Searchable, filterable and paginated asset library; route-driven detail;
  metadata update; workspace-scoped usage inspection; guarded deletion.

## Key files

- Contracts: `packages/contracts/src/page-change-classifier.ts`,
  `packages/contracts/src/component-registry.ts`, `packages/contracts/src/index.ts`.
- API: `apps/api/src/domain/page.service.ts`, `page.controller.ts`,
  `asset.service.ts`, `asset.controller.ts`, and role defaults/migration paths.
- CMS: `apps/cms/builder/builder-shell.tsx`, `grapes-editor.tsx`, Inspector,
  `apps/cms/app/pages/*`, `apps/cms/app/assets/*`.
- Renderer: preview version query handling in
  `apps/renderer/app/preview/[pageId]/page.tsx` and `page-api.ts`.

## Final gates

The final gate table is updated only from commands executed for this handoff:

```text
pnpm format:check              PASS
pnpm lint                      PASS
pnpm typecheck                 PASS
pnpm check:cms-design-system   PASS
pnpm test                      PASS (52 contracts, 118 CMS, 65 API, 22 renderer; 12 API integration tests skipped)
pnpm build                     PASS
pnpm exec playwright test      PASS (87/87)
git diff --check               PASS
```

The commands emitted the repository's existing Node engine warning because this
workspace uses Node 22 while the package metadata requests Node 24+. Hosted CI
was not inspected or changed in this local worktree pass.

## Intentional limitations

Binary upload/storage providers, approval workflows, comments, collaboration,
scheduling, AI, experiments and external data providers remain deferred.
