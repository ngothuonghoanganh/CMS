# Phase 21 final handoff

Status: COMPLETE — final security closure implemented; all required local repository gates pass.

Original Phase 21 implementation HEAD: `6da922231f2f7ce1a8997585a5f03b6a579188b8`.
First closure-pass HEAD: `c224291ec4584ddd27105efb34a10559c979270a`.
Final security-closure starting HEAD: `c224291ec4584ddd27105efb34a10559c979270a`.
Final security-closure ending HEAD: `c224291ec4584ddd27105efb34a10559c979270a`
(final closure changes are uncommitted in the working tree).

## Delivered seams

- `page.design` capability with registry-driven content/design classification
  and server-side `PAGE_DESIGN_PERMISSION_REQUIRED` enforcement.
- Tenant-scoped one-time custom-role migration
  `phase21-page-design-custom-role-backfill-v1`, with capability version `1`,
  preserving legacy structural roles without recurring privilege escalation.
- Explicit registry scopes for ambiguous/behavioral properties, including
  heading/list semantics, media playback, compound interaction behavior,
  navigation source/layout and brand presentation.
- Shared CMS `page.create` + `page.design` gating for page creation,
  duplication and template application; metadata and page layout attachments
  are unavailable to content-only users.
- Content/Design modes in the single Page Builder with content-only Inspector
  filtering and command/drag safety.
- Bounded version history, authenticated historical preview, CAS restore as a
  new draft, dedicated canonical current-draft reads, page-identity pagination
  reset, and rollback audit metadata.
- Source-backed publish readiness and a publish dialog with issue lists and a
  change summary including first-publish additions; publish remains
  authoritative and unpublish remains separate.
- Searchable, filterable and paginated asset library; route-driven detail;
  metadata update; workspace-scoped usage inspection; exhaustive fail-closed
  guarded deletion with exact asset ID/storage-key matching.
- Pre-Phase-22 UX foundation consolidation: workspace-owned collections and
  navigation APIs, Builder-owned inline menu editing, constant/conditional
  collection fields, Form/JSON entry editing, asset upload/folders, and a
  workspace Design System fallback.

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
pnpm test                      PASS (58 contract, 118 CMS, 83 API, 22 renderer tests; 12 API integration tests skipped)
pnpm build                     PASS
pnpm exec playwright test      PASS (91/91, including `phase-21-closure.spec.ts`)
git diff --check               PASS
```

The commands emitted the repository's existing Node engine warning because this
workspace uses Node 22 while the package metadata requests Node 24+. Production
build regenerated the tracked CMS and renderer `next-env.d.ts` references from
`.next/dev` to `.next/types`; no manual generated-file edits were made.

Hosted CI: Foundation CI run #32 for `c224291ec4584ddd27105efb34a10559c979270a`
failed before any job step because the GitHub account was locked due to a billing
issue. Hosted repository gates are therefore not verified; no hosted state was
changed by this worktree pass.

## Intentional limitations

Approval workflows, comments, collaboration, scheduling, AI, experiments and
external data providers remain deferred. The consolidation adds a local asset
storage provider; managed object-storage adapters remain deployment work.
