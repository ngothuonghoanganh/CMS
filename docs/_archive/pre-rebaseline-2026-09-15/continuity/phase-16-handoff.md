# Phase 16 Handoff — Compound Components, Structural Contracts & Runtime

Read [`phase-16.md`](../phase-16.md) for the closure report.

## Durable invariants

- `PagePayload` is persisted content truth.
- GrapesJS is the live editor document engine.
- `editor-commands.ts` is the only builder mutation boundary.
- `PAGE_COMPONENT_REGISTRY` owns component, placement, slot, cardinality and
  component-part capabilities.
- `style-registry.ts` owns the finite responsive style vocabulary.
- The production renderer is public rendering truth.
- GrapesJS UndoManager is the sole builder history owner.
- `selectedNodeId` is canonical selection identity; React stores snapshots, not
  a second mutable page tree.
- Editor-only previews, slot markers and runtime interaction state never enter
  persisted payloads.

## Structural platform

`builder-structural-domain.ts` centralizes live slot occupancy, child ownership,
slot resolution and insertion checks. Placement, drag/drop, Quick Add,
structural Inspector actions, command execution and V5/V6 parsing use the same
rules. Implicit placement rejects a child type that matches multiple slots.

Accordion and Tabs own internal item nodes through structural slots. Internal
items are addressable but not palette-insertable. Gallery owns an image-only
slot with minimum one and maximum fifty children. Compound insertion,
normalization and duplication are grouped as single UndoManager actions, and
duplicated subtrees receive fresh IDs.

## V6 and runtime

V6 adds Accordion/Tabs accessibility props and registry-owned component-part
styles. Part names, style properties, values and responsive viewports are
validated at contracts and adapter boundaries; responsive output is scoped to
the owning node. Accordion uses semantic headings/buttons, stable controls and
labelled regions. Tabs uses tablist/tab/tabpanel relationships, roving focus,
orientation-aware keys, Home/End and automatic/manual activation.

## Verification handoff

Validated with Node `v24.11.0` and pnpm `10.15.0`:

- format, lint, typecheck and build — PASS
- unit suites — PASS: Contracts 36, CMS 76, Renderer 16, API 47 passed / 12
  skipped
- focused Phase 15–17 Playwright gate — PASS: 7/7
- Phase 16 Playwright suite — PASS: 4/4
- full Playwright suite — 56/58 passed; the two known baseline failures are
  tenant-extension disable (`409` instead of expected `201`) and builder /
  renderer screenshot parity (65 mismatches versus threshold 8)

The starting HEAD was `747d47cdfb394ccc807ea5f9a0fe53b223d934cd`; no commit was
created during this work, so the implementation and documentation are staged
only as working-tree changes. There is no dedicated Phase14 Playwright file;
use the full suite for those existing regression paths.

## Next phase

Phase 17 is complete for the implemented site-global scope. Phase 18 can begin
after release ownership decides whether to resolve the two unrelated full-suite
baseline failures.
