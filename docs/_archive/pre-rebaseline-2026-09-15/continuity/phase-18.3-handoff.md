# Phase 18.3 Handoff

Implementation commit: `3731bb5` (`feat: improve builder validation UX and E2E determinism`)

## What changed

- Added the normalized Builder validation issue contract/coordinator and compact navigator.
- Moved constrained inspector controls to local draft + commit behavior, preserving the last valid payload value.
- Added stable Inspector field identity, inline errors, ARIA state, transient focus flash, Canvas invalid styling, and Layers markers.
- Mapped expected editor/API validation failures to contextual issues while retaining strict adapter, schema, security, and system-error paths.
- Added the canonical E2E tenant/workspace/site/page fixture, deterministic temporary-page ownership, reset logic, tenancy tags, and cleanup CLI.
- Fixed orphan integration binding cleanup without allowing deletion while live page bindings remain.

## Canonical resources

| Resource  | Name / slug                         | ID                                     |
| --------- | ----------------------------------- | -------------------------------------- |
| Tenant    | E2E Development / `e2e-development` | `3ad43433-cbfc-4dfd-a760-e8c85860210e` |
| Workspace | E2E Workspace                       | `a793634c-4f54-4386-8854-9368a8555322` |
| Site      | E2E Builder Site / `e2e-builder`    | `af0ebd15-29d9-4bcb-8847-6794715e12d5` |
| Page      | E2E Home / `e2e-home`               | `60ce8607-be95-4f32-8072-7fae617e1384` |

## Verification

- `pnpm exec prettier --check .`: pass
- `pnpm lint`: pass
- `pnpm typecheck`: pass
- `pnpm test`: pass (`105` CMS, `39` contracts, `19` renderer, `48` API; `12` configured skips)
- `pnpm build`: pass
- Validation UX repeated focused run: `6/6`
- Phase 18.2 regression: `11/11`
- `pnpm test:e2e`: `62/62`
- `pnpm test:e2e:tenancy`: `7/7`
- `pnpm test:e2e:full`: `69/69`
- Normal E2E data snapshot: tenants `287 → 287`, canonical sites `1 → 1`, temporary pages `0 → 0`, temporary integrations `0 → 0`.
- `pnpm test:data:cleanup --dry-run`: pass; `293` legacy E2E tenants reported, canonical resources preserved, no temporary page/integration/public-route residue.

## Follow-up before Phase 19

1. Re-run the release gate under Node `>=24.0.0`.
2. Add a safe test-only tenant teardown/database cleanup mechanism, or add a lifecycle API with production-safe authorization and audit behavior.
3. Add dedicated navigator E2E coverage for mobile, component parts, header/footer, multiple issues, and global/system-error separation.
