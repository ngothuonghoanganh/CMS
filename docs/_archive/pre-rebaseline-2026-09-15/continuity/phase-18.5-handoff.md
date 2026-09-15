# Phase 18.5 Handoff

## Completed

- Added nullable resource snapshots and centralized effective-draft resolution
  in `packages/contracts`.
- Added derived per-resource `hasPublishedSnapshot` and
  `hasUnpublishedChanges` state.
- Added scoped Header/Footer save, publish, and discard endpoints.
- Updated Site Publish to merge effective globals instead of wiping
  published-only sibling resources.
- Updated Page preview, Builder load/save/publish/discard UX, and renderer
  public/preview selection semantics.
- Added Builder action to start a Header/Footer Draft from a deep clone of its
  Live snapshot; Live remains read-only in the authoring workflow.
- Added contract, SiteService, renderer, and lifecycle E2E coverage.

## Decisions

- Strategy A (lazy fork) is used: GET has no persistence side effect.
- Builder editing always targets Draft. Starting from Live replaces only the
  local Draft editor and requires `Save draft` before it is persisted.
- `null` means explicit removal; omitted means inherit.
- Granular publish validates dependencies against the published Design System
  and does not auto-promote Navigation, Footer, Design System, or Reusables.
- Full Site Publish retains the existing site-level promotion behavior.
- No tenant/site/database cleanup or destructive migration is part of Phase
  18.5.

## Verification

Run from the repository root with Node >=24 and pnpm >=10.15:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright test tests/e2e/global-resource-lifecycle.spec.ts --workers=1
```

Observed on 2026-09-01 with Node `v22.19.0` / pnpm `10.15.0` (Node emitted the
repository engine warning because the local runtime is below the declared
Node >=24 requirement):

- `pnpm format:check`: passed.
- `pnpm lint`: passed.
- `pnpm typecheck`: passed.
- `pnpm test`: passed — contracts 41, CMS 105, renderer 20, API 60 passed / 12 skipped.
- `pnpm build`: passed.
- Phase 18.5 lifecycle E2E: passed.
- Relevant regression E2E: 6 passed (Navigation, Phase 17, Phase 17.1).
- `pnpm test:e2e`: 62 passed / 2 environment failures outside the globals
  lifecycle (Builder ↔
  Review layout parity offset and custom-domain SEO public route).
- `pnpm test:e2e:full`: 68 passed / 3 environment failures (the two above plus
  tenancy billing login).

The canonical E2E tenant/workspace/site was reused; its site count remained
one and no Phase 18.5 fixture created or deleted a tenant/site. The working
tree remains uncommitted at the starting SHA until an explicit commit request.
