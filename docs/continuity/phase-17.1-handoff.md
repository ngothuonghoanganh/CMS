# Phase 17.1 Handoff — Builder Stability & Correctness

Read [`phase-17.1.md`](../phase-17.1.md) for the implementation report and
[`phase-17-handoff.md`](phase-17-handoff.md) for the site-global data boundary.

## Durable decisions

- `builder-node-identity.ts` is the single identity/remapping service for
  editor definitions.
- A definition is safe before insertion; clone-then-repair is not an accepted
  implementation pattern.
- `root` is a structural sentinel and is never duplicated.
- Site global documents always contain one existing semantic region root.
- Global presets replace region children, with confirmation for non-empty work,
  and never append a second global root.
- Global local state is replaced from the parsed server acknowledgement after
  save; a failed save blocks document switching.
- `BuilderPreviewNode` is the finite catalog preview DSL. Registry primitives
  use semantic trees, while block/global preset previews are resolved from the
  actual GrapesJS definition returned by their factory.
- Catalog names are never the only discoverability affordance: searchable
  metadata, full card labels, and portal tooltips support mouse hover and
  keyboard focus without scroll-panel clipping.
- Desktop panel width is UI state, not document state. The two independent
  localStorage keys, min/max clamping, pointer-capture shield, keyboard
  separator semantics, and collapse restore behavior belong to the shell.

## Validation checklist

- Identity unit tests cover duplicate detection, fresh IDs, compound remapping,
  root preservation, and reference remapping.
- Command tests cover leaf/compound duplication, insertion remapping, global
  preset application, and selection behavior.
- Contract/adapter tests cover global root cardinality and serialization
  uniqueness.
- Phase 17 and Phase 17.1 E2E cover global isolation, save/reload/publish,
  catalog context/search/composition previews/tooltips, duplicate ID
  uniqueness, exact one-root presets, panel resizing/persistence/responsive
  fallback, and Undo/Redo behavior.

## Follow-up boundaries

Do not broaden this work into mega menus, reusable symbols, theme libraries,
arbitrary HTML/JS, dynamic binding, or navigation-management redesign. Any
future component must register its document scope, description, finite preview
metadata/tree, slots, and validation contract before it becomes an Add option.
