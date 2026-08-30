# Phase 16 Handoff — Compound Components, Structural Contracts & Runtime

Read [`phase-16.md`](../phase-16.md) for the implementation report.

## Invariants

- `PagePayload` and `PageDocument.payload` are persisted content truth.
- GrapesJS is the live editor document engine.
- `editor-commands.ts` is the authoritative user mutation boundary.
- `PAGE_COMPONENT_REGISTRY` is the semantic, structural and placement source.
- `PAGE_COMPONENT_STYLE_CAPABILITIES` plus `styleSchemaFor()` are the style
  capability source.
- The production renderer is the public rendering truth.
- GrapesJS UndoManager is the sole history owner.
- `selectedNodeId` is canonical selection identity; React holds snapshots, not
  a copied page tree.
- Editor-only previews and runtime state never enter persisted PagePayload.

## Structural registry contract

`ComponentSlotDefinition` describes `allowedChildren`, optional
`minChildren`/`maxChildren`, `allowMultiple`, `addLabel` and structural
ownership. `canInsertChild`, `canRemoveChild`, `canDuplicateChild` and
`findAcceptingSlot` are the shared validation helpers. Placement, drag/drop,
Quick Add, structural Inspector actions, command execution and V5 parsing must
continue to use these helpers or equivalent registry-derived checks.

The builder palette exposes only definitions whose `builder.insertable` is
true. Internal nodes are not global blocks. Structural add actions create fresh
stable IDs and fresh child models through the normal command path.

## Internal component contract

Accordion owns `accordion-item`; Tabs owns `tab-item`. These nodes are persisted
and addressable, but are internal (`internal: true`, `insertable: false`) and
may only be inserted under their owning parent slot. Their own content slots
remain registry-defined and can contain ordinary registered nodes. Gallery has
an image-only slot and must reject buttons or other arbitrary children.

Do not introduce Navbar, Slider/Carousel or Lightbox through this contract
without a separate phase decision. Do not use arbitrary HTML, scripts or
provider-specific embeds as a shortcut for compound behavior.

## Command contract

Inspector, Canvas, Layers, Quick Add and structural controls dispatch finite
commands. `insert-structural-child` delegates creation to the same block
definition factories used by ordinary insertion. Remove and duplicate enforce
slot min/max constraints both in the command bus and in direct execution paths,
so callers cannot bypass cardinality by skipping a UI disabled state.

## Codec contract

`component-editor-codecs.ts` is the CMS-only selection codec. It reads identity,
validated semantic props, style values and shallow child summaries from a live
GrapesJS model. It may provide compatibility fields for existing Inspector
controls, but it must not become a persisted-tree store, arbitrary JSON-path
mutator or second history system. `component-editor-bindings.ts` validates
finite property updates and maps them to command vocabulary.

## PagePayload V5 contract

V5 preserves V1–V4 nodes and adds Quote, Accordion, Accordion Item, Tabs, Tab
Item and Gallery. `PagePayloadV5Schema` is the authority for recursive shape,
stable unique IDs, registry-approved child types, ownership and min/max
cardinality. Serialization promotes to V5 based on actual persisted nodes, not
editor UI state. V1–V4 schemas must remain backward compatible.

Any API traversal that handles page nodes must use the complete payload union;
forms, submissions, integrations and analytics must keep working when a V5
compound node contains a form descendant.

## Runtime and accessibility contract

Accordion and Tabs behavior is client-only session state. Accordion uses
semantic headings/buttons, `aria-expanded`, `aria-controls`, stable panel IDs,
and labelled regions. Tabs uses `tablist`/`tab`/`tabpanel`, stable relationships,
roving `tabIndex`, orientation-aware Arrow keys, Home/End and manual
Enter/Space activation. Runtime state must not be serialized or treated as
editor selection state.

Builder previews may be static and editing-friendly; production renderer output
must retain the semantic runtime structure and authored styles.

## Next-phase guardrails

- Keep new structure in registry slot definitions and generic command/Inspector
  flows; do not add a per-component structural branch to the shell.
- Keep internal node ownership explicit and keep internal nodes out of the
  global palette.
- Preserve stable IDs through add, reorder, duplicate, save, reload and
  runtime ARIA relationships.
- Preserve GrapesJS as the only live tree and UndoManager as the only history.
- Run the Phase 15 regression suites before expanding another node family.
- The local environment is Node 22.19.0 while the repository requires Node
  > =24; verify again on the supported runtime before release.

## Validation handoff

- Phase 15 regression gate before Phase 16: CMS 64, contracts 30, renderer 13
  passed.
- Phase 16 unit gate: contracts 32, CMS 72, renderer 14 passed; API 47 passed
  with 12 skipped integration tests.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` and
  `pnpm build` passed under Node 22.19.0 with the Node `>=24` warning.
- Focused Phase 16 Playwright suite: 4/4 passed.
- Full Playwright suite: 55/57 passed. Phase 15 and Phase 16 scenarios all
  passed. Remaining failures are the tenant extension fixture's 409 response
  and the existing builder/review desktop screenshot mismatch (65 vs threshold
  8).
