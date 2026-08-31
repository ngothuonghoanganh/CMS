# Phase 16 Handoff — Compound Components, Structural Contracts & Runtime

Read [`phase-16.md`](../phase-16.md) for the implementation report.

## Invariants

- `PagePayload` and `PageDocument.payload` are persisted content truth.
- GrapesJS is the live editor document engine.
- `editor-commands.ts` is the authoritative user mutation boundary.
- `PAGE_COMPONENT_REGISTRY` is the semantic, structural and placement source.
- Style capability metadata and the responsive vocabulary are registry-owned.
- The production renderer is the public rendering truth.
- GrapesJS UndoManager is the sole history owner.
- `selectedNodeId` is canonical selection identity; React holds snapshots, not
  a copied page tree.
- Editor-only previews, slot markers and runtime state never enter
  `PagePayload`.

## Structural registry contract

`ComponentSlotDefinition` describes accepted child types, optional
`minChildren`/`maxChildren`, `addLabel` and structural ownership.
`getSlotOccupancy`, `resolveSlotForChild`, `canInsertIntoSlot`,
`canRemoveFromSlot` and `canDuplicateInSlot` are the per-slot helpers; legacy
aggregate helpers delegate to them. Placement, drag/drop, Quick Add,
structural Inspector actions, command execution and V5/V6 parsing use these
rules. Implicit resolution rejects a child type that matches multiple slots.

The public palette exposes only definitions whose `builder.insertable` is true.
Accordion and Tabs internal children are created by their owner slots. Gallery
owns an image-only slot with min 1 and max 50.

## Editor contract

The Structure Editor is generic over every structural slot and provides add,
remove, duplicate, keyboard move and drag reorder. Remove and duplicate are
disabled at cardinality limits in the UI and rejected again at the command
boundary. The codec map provides a generic fallback for registered components;
semantic schemas and finite bindings remain the safety boundary.

## PagePayload V5/V6 contract

V5 preserves V1–V4 and adds Quote, Accordion, Accordion Item, Tabs, Tab Item and
Gallery. V6 adds optional Accordion/Tabs accessibility props and registry-owned
component-part styles. Part names, style properties, values and responsive
viewports are validated; responsive part rules are scoped to the owning node.
V5 payloads are not rewritten merely because a document is opened or previewed.

API traversal must use the complete payload union; forms, submissions,
integrations and analytics must continue to work when a compound node contains
a form descendant.

## Runtime accessibility contract

Accordion and Tabs behavior is client-only session state. Accordion uses
semantic headings/buttons, `aria-expanded`, `aria-controls`, stable panel IDs
and labelled regions. Tabs uses `tablist`/`tab`/`tabpanel`, stable
relationships, roving `tabIndex`, orientation-aware Arrow keys, Home/End and
manual or automatic activation. Runtime state is never serialized.

## Validation handoff

Final closure validation ran under Node 22.19.0 and prints the repository's
existing Node `>=24` engine warning:

- `pnpm verify`: passed. API: 47 passed and 12 skipped; CMS: 74 passed;
  Contracts: 34 passed; Renderer: 15 passed. Format, lint, typecheck and all
  package builds passed.
- Phase 16 Playwright suite: 4/4 passed.
- Full Playwright suite: 55/57 passed. The two failures are the known baseline
  tenant-extension disable response (`409` vs expected `201`) and builder /
  renderer screenshot parity (65 mismatches vs threshold 8); no Phase 16 test
  or legacy builder drag flow failed.

The two baseline failures remain separate release-owner follow-up items. Also
repeat the validation under Node 24 or newer before release, or explicitly
accept the Node-version limitation with the release owner.
