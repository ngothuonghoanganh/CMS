# Phase 16 — Compound Components, Structural Contracts & Interactive Runtime

## Starting point

- Starting HEAD: `b0459e3ead39d3a8b644c86aabebe997218a474a`
  (`feat(cms): add registry-driven component platform`).
- Ending HEAD: unchanged at `b0459e3ead39d3a8b644c86aabebe997218a474a`;
  Phase 16 implementation is an uncommitted working-tree change.
- The Phase 15 regression gate was run before expansion: CMS 64 tests,
  contracts 30 tests and renderer 13 tests passed.

## Architecture

Phase 16 extends the registry into a structural contract. Each slot describes
accepted child types, cardinality, ownership and editor affordances. Placement,
serialization and command validation use that contract, so a new compound
component does not require a new hardcoded shell or Inspector branch.

Accordion and Tabs own persisted internal `accordion-item` and `tab-item`
nodes. Those nodes are valid PagePayload content but have `builder.insertable:
false` and `internal: true`, so users add them through the owning structural
slot rather than the global palette. Gallery similarly exposes an image-only
slot with a bounded cardinality.

The editor now has a CMS-only component selection codec in
`component-editor-codecs.ts`. It converts a selected GrapesJS model into a
validated semantic snapshot for the Inspector; it does not own a second page
tree or mutate GrapesJS. Structural edits and property changes still pass
through `editor-commands.ts`, and GrapesJS UndoManager remains the sole history
owner.

## PagePayload V5

V5 retains all V4 nodes and adds:

- `quote` with plain text and optional cite;
- `accordion` with bounded item slots and `allowMultiple`;
- `accordion-item` with a stable ID, title, default-open state and content;
- `tabs` with bounded tab-item slots and horizontal/vertical orientation;
- `tab-item` with a stable ID, label and content;
- `gallery` with a bounded image-only slot.

`PagePayloadV5Schema` validates recursive node shape, stable unique IDs,
registry-approved parent/child relationships, slot ownership, and min/max
cardinality. Existing V1–V4 schemas retain their original meaning; the union
accepts all five versions. Serialization promotes a tree to V5 only when a V5
node is present.

## Components and runtime

- Quote renders as semantic `blockquote`, paragraph and optional `cite`, with
  generic content/style Inspector controls.
- Accordion renders session-local open state, heading/button semantics,
  `aria-expanded`, `aria-controls`, labelled regions, and default-open values
  from the payload.
- Tabs renders `tablist`, `tab`, and `tabpanel` relationships with stable IDs,
  roving focus, orientation-aware Arrow keys, Home/End, and manual
  Enter/Space activation. Active/focused state is runtime session state, not
  persisted content.
- Gallery renders authored grid styles with a safe responsive default and
  accepts only images.

The builder shows editor-friendly previews and structural controls while the
production renderer remains the rendering authority. Navbar, Slider/Carousel,
Lightbox, arbitrary HTML, scripts and provider embeds are outside this phase.

## Main files

- Contracts and registry: `packages/contracts/src/index.ts`,
  `packages/contracts/src/component-registry.ts`,
  `packages/contracts/src/page-runtime.ts`.
- Builder structural adapter, placement, commands, bindings and codec:
  `apps/cms/builder/builder-adapter.ts`, `builder-placement.ts`,
  `editor-commands.ts`, `component-editor-bindings.ts`,
  `component-editor-codecs.ts`, `grapes-editor.tsx`, and Inspector/shell files.
- Runtime and renderer: `apps/renderer/app/core-interactive-runtime.tsx` and
  `apps/renderer/app/renderer.tsx`.
- Coverage: the Phase 16 unit specs and
  `tests/e2e/phase-16-compound-components.spec.ts`.

## Verification

- `pnpm format:check`: passed.
- `pnpm lint`: passed.
- `pnpm typecheck`: passed.
- `pnpm test`: passed — contracts 32, CMS 72, renderer 14; API 47 passed and
  12 skipped integration tests.
- `pnpm build`: passed for contracts, API, CMS, renderer and CLI.
- `pnpm exec playwright test tests/e2e/phase-16-compound-components.spec.ts`:
  4/4 passed.
- Full `pnpm test:e2e`: 55/57 passed. All Phase 16 and Phase 15 scenarios
  passed.

## Known failures and debt

The two full-suite failures are outside the Phase 16 scenarios:

1. `tests/e2e/api.spec.ts` tenant extension fixture expected HTTP 201 while
   disable returned HTTP 409.
2. `tests/e2e/builder-renderer-parity.spec.ts` builder/review desktop
   screenshot mismatch was 65 pixels against a threshold of 8.

The repository still declares Node `>=24`, while this verification ran on
Node 22.19.0 and emitted the existing engine warning. Atomic history grouping
for multi-node preset/compound creation and richer item-level editing remain
follow-up work.

## Phase 17 readiness

**YES for the architecture gate.** A future FAQ-style component can reuse the
Accordion structural contract and runtime pattern; an additional compound
component can define its own registry-owned internal node and slots without
adding shell-specific structural branches. The two unrelated full-E2E failures
and the Node-version warning remain release debt to resolve separately.
