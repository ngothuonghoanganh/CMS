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

This section is completed from actual Git and CI output. PR #1 was merged;
the two later `main` commits are recorded below.

- Final feature branch SHA: `2fa2f4e` (`docs: record phase 23.1 release blocker`)
- Pull request: [#1](https://github.com/ngothuonghoanganh/CMS/pull/1),
  `ao/cms-4/phase-23.1-release-stabilization` → `main`
- CI: Foundation CI run
  [34620498814](https://github.com/ngothuonghoanganh/CMS/actions/runs/34620498814)
  failed before starting; GitHub annotation says the account is locked due to
  a billing issue. The follow-up run
  [34620766111](https://github.com/ngothuonghoanganh/CMS/actions/runs/34620766111)
  was blocked by the same account billing condition.
- Merge commit: `b331239e89869fbc95170c04eb8f061fa5d9eead` (`Merge pull request #1`)
- Later `main` commit: `705e3c9d3bd8b627e25d41240ea057d8d3451e82` (`fix(builder): sync composed block edits`)
- Later `main` commit: `bb5d77983531218834066cfe02344f639924ab91` (`merge: stabilize builder block editing`)
- Final `main` SHA for Phase 23.1: `bb5d77983531218834066cfe02344f639924ab91`

## Remaining issues

- Local release gates were green, including 108 Playwright tests with 0
  failures. The GitHub billing condition prevented the required CI job from
  starting, but it did not prevent the authorized merge. Unrelated future
  enhancements remain outside this closure phase.
