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
- Builder catalog previews are registry metadata rendered with local CSS; no
  arbitrary remote image is part of the catalog contract.

## Validation checklist

- Identity unit tests cover duplicate detection, fresh IDs, compound remapping,
  root preservation, and reference remapping.
- Command tests cover leaf/compound duplication, insertion remapping, global
  preset application, and selection behavior.
- Contract/adapter tests cover global root cardinality and serialization
  uniqueness.
- Phase 17 and Phase 17.1 E2E cover global isolation, save/reload/publish,
  catalog context/search/previews, duplicate ID uniqueness, exact one-root
  presets, and Undo/Redo behavior.

## Follow-up boundaries

Do not broaden this work into mega menus, reusable symbols, theme libraries,
arbitrary HTML/JS, dynamic binding, or navigation-management redesign. Any
future component must register its document scope, description, preview
metadata, slots, and validation contract before it becomes an Add option.
