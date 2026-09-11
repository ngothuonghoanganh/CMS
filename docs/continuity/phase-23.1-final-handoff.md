# Phase 23.1 Final Handoff

## Starting state

- Repository: `ngothuonghoanganh/CMS`
- Starting `main` SHA: `7f18357`
- Feature branch: `ao/cms-4/phase-23.1-release-stabilization`
- Node validation target: `v24.11.0`
- Initial full Playwright baseline: 105 total, 81 passed, 24 failed

## Root causes closed

- CORS wildcard reflection was not bounded by environment policy.
- Open Composition authoring metadata was incomplete and structural exposure
  had an Inspector-only hardcoded child allowlist.
- Browser fixtures switched auth context but navigated to an old workspace URL.
- Renderer E2E requests could fall back to the wrong API port.
- Collection and custom-user journeys relied on non-deterministic or missing
  tenant-scoped fixture state.
- A few older E2E locators still described pre-Phase-23 Layers/Inspector UX.

## Implementation and tests

- `packages/contracts/src/open-composition.ts` now has exhaustive authoring
  dispositions, insertability metadata, semantic authoring definitions, and
  shared insertable-child derivation.
- `apps/api/src/config/cors.ts` centralizes the CORS policy and its unit tests
  cover development wildcard, production rejection, explicit origins, and no
  credentialed origin.
- `tests/e2e/phase-23.1-release-stabilization.spec.ts` covers browser V7→V8
  migration/content/ID preservation, preview and public V8 Contact Form
  validation/submission persistence, and chaos-user recovery.
- Legacy component-part, route, integration, collection, auth, publishing,
  and CMS locator regressions were updated at their smallest correct layer.

## Final release record

This section is intentionally completed from actual Git/CI output after the
feature commit, push, PR, merge, and post-merge verification. No SHA is
invented here.

- Final feature branch SHA: pending final commit
- Pull request: pending creation
- CI: pending final run
- Merge commit: pending merge
- Final `main` SHA: pending post-merge verification

## Remaining issues

- None expected for Phase 23.1 once the required local gates and PR CI are
  green. Unrelated future enhancements remain outside this closure phase.
