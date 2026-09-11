# Phase 23.1 — Release Stabilization, Authoring Completeness & Security Closure

**Status:** In progress on `ao/cms-4/phase-23.1-release-stabilization`.

## Starting state

- Starting `origin/main`: `7f18357` (`update`)
- Baseline Node: `v24.11.0`
- Baseline browser suite: 105 tests, 81 passed, 24 failed
- Baseline design-system check: one stale Builder allowlist path

## Closure work

- Added explicit `authorable`, `read-only`, and `internal` dispositions for
  every Open Composition node type.
- Added authoring completeness tests and removed the Inspector's hardcoded
  child-type whitelist. Add, Inspector structure, Quick Add, and structural
  validation now use shared registry capabilities.
- Reused the existing property control engine and kept Layers focused on the
  document tree; legacy component part styling remains in the Inspector.
- Hardened CORS: development may opt into wildcard reflection, production
  rejects `*`, explicit production origins remain credentialed, and no origin
  configuration disables credentialed CORS.
- Fixed canonical browser fixture context switching, deterministic collection
  seeds/cleanup, renderer API routing, and tenant-aware custom-user login.
- Added browser release gates for V7→V8 migration, public V8 Contact Form
  validation/submission, and rapid no-code selection/save/viewport/undo/reload.

## Verification

The final quality-gate and merge record is maintained in
`docs/continuity/phase-23.1-final-handoff.md` and is updated only with SHAs
read from Git after each real Git operation.
