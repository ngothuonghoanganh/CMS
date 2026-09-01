# Phase 18.4 handoff

## Completed

- Added versioned navigation structures: `draftItems` and `publishedItems`.
- Preserved legacy `items` records as draft + published structures on read.
- Removed the unrelated-navigation blocker from Page Publish.
- Added Site Publish navigation snapshotting and non-blocking draft target
  warning counts.
- Made Preview resolve draft navigation and Public resolve published
  navigation with dynamic page availability filtering.
- Kept referenced-page deletion protection and shared Header/Footer resolution.
- Added CMS target status/unpublished-change indicators.
- Added API unit, contract, and canonical lifecycle E2E coverage.

## Important invariants

1. Do not auto-publish pages because a navigation item points at them.
2. Do not delete navigation references when a page is unpublished; publishing
   the page later must make the item reappear automatically.
3. Do not emit internal public links without a current published page version.
4. Treat legacy `items` as already-live data during rolling upgrades.

## Verification

- `pnpm format:check` — pass.
- `pnpm lint` — pass.
- `pnpm typecheck` — pass.
- `pnpm test` — pass: 55 API, 105 CMS, 19 renderer, and 39 contracts tests.
- Targeted E2E — pass: 46 tests across API, CMS, Phase 17/17.1, and
  `navigation-publishing.spec.ts`.
- `pnpm test:e2e` — 61 pass, 2 existing canonical-data failures in analytics
  and builder-renderer parity.
- `pnpm test:e2e:full` — 68 pass, 2 existing environment failures: billing
  control-plane login and builder-renderer parity geometry.
- `pnpm build` — pass.

The current workspace reports Node 22, while the project requires Node >= 24;
all commands emit the expected engine warning and should be rerun after the
runtime is upgraded.
