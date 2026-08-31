# Phase 16 — Compound Components, Structural Contracts & Interactive Runtime

## Status

**PHASE 16 COMPLETE: YES** for the focused release gate. The implementation
started from `747d47cdfb394ccc807ea5f9a0fe53b223d934cd` and remains uncommitted
in the working tree; the ending HEAD is still `747d47c`.

## Closure

Phase 16 now has one registry-driven structural platform for compound
components, rather than component-specific placement branches:

- `builder-structural-domain.ts` is the shared live-slot domain used by
  placement, commands, drag/drop, Quick Add and structural Inspector actions.
- Slot ownership remains editor-only (`data-payload-slot`); it is not persisted
  in `PagePayload`.
- Registry relationships, slot occupancy and min/max cardinality are validated
  at contract, adapter and command boundaries. Test-only overlapping-slot
  fixtures prove that occupancy is independent and implicit ambiguous placement
  is rejected.
- Compound insert, duplicate, Accordion sibling normalization and structural
  operations are grouped through GrapesJS UndoManager, which remains the sole
  builder history owner. Duplicated subtrees receive fresh IDs.
- `COMPONENT_EDITOR_CODECS` uses generic primitive handling plus named semantic
  codec entries for list, countdown, Accordion, Tabs and the V6/global semantic
  components. Commands own lifecycle, lookup, history and mutation boundaries;
  Inspector sends semantic node/property/value data.
- V6 Accordion/Tabs accessibility props and registry-owned component-part
  styles use the finite style vocabulary and responsive validation. Renderer
  coverage verifies base and responsive part-style output.
- Accordion enforces the single-default-open invariant in contracts, editor
  normalization and runtime defensive initialization. Tabs and Accordion
  runtime modules provide their required ARIA semantics and keyboard behavior.
- Gallery remains image-only with structural min/max enforcement and authored
  responsive styles; no Asset Manager redesign was added.

## Verification

Commands were run with Node `v24.11.0` and pnpm `10.15.0`:

- `pnpm format:check` — PASS
- `pnpm lint` — PASS
- `TURBO_FORCE=true pnpm typecheck` — PASS
- `pnpm test` — PASS: Contracts 36, CMS 76, Renderer 16, API 47 passed / 12
  skipped
- `pnpm build` — PASS: all five workspace build tasks
- Phase 15 + Phase 16 + Phase 17 focused Playwright gate — PASS: 7/7
- Phase 16 Playwright suite — PASS: 4/4

There is no dedicated `tests/e2e/phase-14*` file in this repository. The
available regression suite was run through the complete Playwright command;
Phase 14 behavior is represented by the existing compatibility, publishing,
CMS and renderer suites.

The complete Playwright run had 58 tests: **56 passed and 2 failed**. Both
failures reproduce the pre-existing baseline and are outside the Phase 16/17
scope:

1. `tests/e2e/api.spec.ts:147` — tenant extension disable expected HTTP 201 but
   received 409.
2. `tests/e2e/builder-renderer-parity.spec.ts:568` — desktop screenshot parity
   measured 65 mismatches against a threshold of 8.

No focused Phase 15–17 test failed. These two items remain explicit release
owner follow-ups rather than being hidden or reclassified as passing.

## Phase 17 readiness

**YES.** The Phase 16 structural, style, codec, command, runtime and registry
contracts are reusable by the site-global documents implemented in Phase 17.
