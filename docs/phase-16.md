# Phase 16 — Compound Components, Structural Contracts & Interactive Runtime

## Status

Phase 16 closure is implemented on the Phase 15 registry-driven component
platform. Current HEAD is `0b4a8c2` (`feat(cms): add compound components and
interactive runtime`);
the closure implementation is in the working tree.

## Architecture

`packages/contracts/src/component-registry.ts` is the single source of truth
for component definitions, slots, cardinality, builder exposure, style
capabilities and reverse parent relationships. `allowedChildren` is derived
from slots and `allowedParents` is derived from the reverse slot graph.

The slot engine exposes per-slot occupancy and explicit slot predicates for
insert, remove and duplicate. Implicit placement returns no result when a
child type matches multiple slots. A test-only multi-slot fixture proves that
overlap is rejected and that explicit slot occupancy remains independent; it
is not part of the production registry or palette.

Accordion and Tabs own persisted internal `accordion-item` and `tab-item`
nodes. These nodes are addressable but `internal: true` and
`builder.insertable: false`, so they are created only through their owning
structural slots. Gallery is a first-class insertable component with an
image-only slot, minimum one child and maximum fifty children.

Canvas, Layers, Quick Add, drag/drop, structural Inspector actions and command
execution use the same slot-aware placement rules. New structural children are
created with stable IDs and an editor-only slot ownership marker; the adapter
does not persist that marker as payload data.

## Editor and runtime

`component-editor-codecs.ts` contains the registry-keyed selection codec map
and generic fallback. It converts a selected GrapesJS model into a validated
semantic snapshot for the Inspector; it does not create a second page tree.
All mutations flow through `editor-commands.ts`; GrapesJS UndoManager remains
the history owner.

The generic Structure Editor renders every structural slot and supports add,
remove, duplicate, keyboard reorder and drag reorder. It is shared by Gallery,
Accordion and Tabs rather than branching in the shell.

Interactive runtime code is split into `runtime/accordion-runtime.tsx`,
`runtime/tabs-runtime.tsx` and `runtime/runtime-registry.ts`. Accordion uses
semantic headings/buttons, `aria-expanded`, `aria-controls`, labelled regions
and default-open state. Tabs uses `tablist`/`tab`/`tabpanel`, stable IDs,
orientation-aware Arrow keys, Home/End, roving focus and manual or automatic
activation.

## PagePayload V5 and V6

V5 adds Quote, Accordion, Accordion Item, Tabs, Tab Item and Gallery while
preserving V1–V4 schemas. Recursive validation enforces stable unique IDs,
registry-approved relationships and slot min/max cardinality.

V6 is additive and only selected when a persisted V6 capability is present:

- Accordion can persist `headingLevel` and an optional `ariaLabel`.
- Tabs can persist `ariaLabel` and `activationMode` (`automatic` or `manual`).
- Accordion and Tabs expose registry-owned `componentParts` with allowlisted
  base/tablet/mobile style capabilities.

Part styles are validated at the payload and adapter boundaries, rendered with
scoped responsive rules and exposed through the Inspector's component-part
target selector. V5 payloads remain unchanged when no V6 capability is used.

Navbar, Slider/Carousel, Lightbox, arbitrary HTML, scripts and provider embeds
remain outside this phase.

## Main files

- Contracts and registry: `packages/contracts/src/index.ts`,
  `packages/contracts/src/component-registry.ts`.
- Builder: `builder-adapter.ts`, `builder-placement.ts`,
  `editor-commands.ts`, `component-editor-bindings.ts`,
  `component-editor-codecs.ts`, `grapes-editor.tsx`, Inspector and shell.
- Structure UI: `apps/cms/builder/inspector/structure-editor/`.
- Runtime and renderer: `apps/renderer/app/runtime/`,
  `core-interactive-runtime.tsx` and `renderer.tsx`.
- Coverage: contracts, adapter, command, codec, placement and renderer specs;
  the Phase 16 Playwright scenario remains the end-to-end gate.

## Verification

Validation completed locally under Node 22.19.0 (the repository requires
Node >=24, so pnpm prints its existing engine warning):

- `pnpm verify`: passed — API 47 passed/12 skipped, CMS 74, Contracts 34,
  Renderer 15; lint, typecheck and all builds passed.
- `pnpm exec playwright test tests/e2e/phase-16-compound-components.spec.ts`:
  4 passed.
- `pnpm test:e2e`: 55 passed, with the two unchanged baseline failures in
  tenant-extension disable status and builder/renderer screenshot parity.

The remaining full-suite failures are outside the Phase 16 closure changes and
are retained as release-owner follow-up items.

## Phase 17 readiness

**YES for the architecture gate.** A future FAQ-style component can reuse the
Accordion structural contract and runtime pattern, and another compound
component can define registry-owned slots without adding shell-specific
structural branches.
