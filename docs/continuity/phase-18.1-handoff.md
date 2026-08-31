# Phase 18.1 Handoff

## Current state

Phase 18.1 implementation is committed as `e798d8b` (`feat: stabilize builder
preview and navigation`) on `main`; the requested push is the final delivery
step.

The builder/preview boundary now uses a validated composite snapshot. Hydration
also repairs legacy duplicate persisted IDs while preserving the first node and
remapping references inside the repaired subtree:

```text
page + globals + resolved navigation + design system + reusables + extensions
```

The preview bridge still accepts the legacy page-only message for compatibility.
Linked reusable source markup is editor-only and cannot leak persisted node IDs
into page placement lookup. Design-system hydration is threaded through builder
conversion, and part style changes are persisted. Navigation has stable-ID tree
operations and a recursive accessible runtime menu.

## Validation

- `pnpm lint` — pass.
- `pnpm typecheck` — pass.
- `pnpm test` — pass: contracts 39, CMS 100, renderer 18, API 47 passed; 12
  existing API integration tests skipped.
- `pnpm build` — pass.
- Focused Phase 17 + Phase 18 E2E — 2 passed.
- Targeted live-preview/Phase 15/Phase 16 rerun — 3 passed.
- Targeted button duplication E2E with console-warning assertion — 1 passed.
- Full E2E — 60 passed, 2 failed.

## Open issues

The full E2E failures match the pre-Phase-18.1 baseline:

1. `tests/e2e/api.spec.ts:326`: tenant extension disable returns 409 instead of 201.
2. `tests/e2e/builder-renderer-parity.spec.ts:501`: desktop builder↔review
   mismatch is 55 instead of the threshold 8.

Do not mark the critical regression gate closed until both are resolved or the
underlying baseline expectations are corrected with evidence. Do not skip or
raise the screenshot threshold to hide the mismatch.

## Next recommended work

1. Trace the extension disable 409 response and decide whether the API contract
   or the test fixture is incorrect.
2. Compare the builder and review screenshots at the first divergent region;
   fix the shared rendering/style source rather than adjusting the threshold.
3. Run on Node 24+ and repeat `pnpm lint`, `pnpm typecheck`, `pnpm test`,
   `pnpm build`, and full Playwright.
4. The user authorized the final state; push commit `e798d8b` to `origin/main`.
