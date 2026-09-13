# Phase 24 — Native Open Composition Parity & Interactive Compound Authoring

**Status: implementation complete on the Phase 24 feature branch; final local
merge verification is recorded in the continuity handoff.**

## Purpose

Phase 24 makes List, FAQ/Accordion, Tabs, and Gallery authorable through the
same no-code Open Composition Builder. The normal path prevents invalid
compound structures at the registry, placement, and command boundaries, then
projects one persisted V8 composition through Builder, Preview, Publish, and
the public renderer.

The product vocabulary is intentionally user-facing: List items, Questions,
Answers, Tabs, Tab names, and Gallery presets. Internal node and behavior
identifiers are not part of the normal authoring controls.

## Architecture and ownership

GrapesJS remains the only authoritative mutable editor model and the existing
GrapesJS UndoManager remains the only history owner. `PagePayload` V8 remains
the persisted forward contract; V1–V7 remain immutable legacy compatibility
contracts. No second editable tree, custom history stack, or parallel renderer
was introduced.

| Concern                         | Canonical owner                             |
| ------------------------------- | ------------------------------------------- |
| List order and item text        | `list.props.items[]`                        |
| List ordered state              | `list.props.ordered`                        |
| Disclosure item identity        | Disclosure item node identity               |
| Disclosure question             | Managed question trigger/content projection |
| Disclosure answer               | Managed answer panel children               |
| Disclosure multiple-open policy | Disclosure semantic configuration           |
| Disclosure default-open state   | Disclosure item semantic configuration      |
| Tab identity and order          | Logical trigger/panel pair under Tabs       |
| Tab label                       | Managed trigger visual content              |
| Tab content                     | Managed panel children                      |
| Trigger-to-panel relation       | Existing behavior/reference contract        |
| Initial active tab              | Tabs `initialTabId` reference               |
| Active UI state                 | Runtime only                                |
| New Gallery layout              | Grid primitive                              |
| New Gallery media               | Image primitives                            |

The persisted V8 node types remain `list`, `disclosure`, and `tabs`. The Add
panel uses `native-list`, `faq`, and `native-tabs` UI definition IDs where the
legacy registry already owns an overlapping display name; those IDs do not
create a new persisted contract.

## Authoring UX and structural prevention

Native List authoring provides Bullets/Numbers, stable item rows, add, edit,
remove, and reorder controls. A list always retains one item. Item identities
are preserved through typing, reorder, focus changes, save, reload, duplicate,
and canonicalization. The controlled text editor keeps row keys stable and
maintains a local draft while the live GrapesJS model updates.

FAQ is the forward V8 disclosure component. Each question is one semantic unit
containing a managed question control and a managed answer panel; answer panel
children remain normal editable content. Aggregate Add, Remove, Duplicate, and
Move Question commands create or change the complete unit and group the action
as one GrapesJS Undo boundary. A disclosure always retains one question.
When multiple answers are not allowed to stay open, changing the default-open
question automatically clears the other defaults. The canonicalizer applies
the same repair to malformed persisted input.

Tabs use logical trigger/panel pairs. Aggregate Add, Remove, Duplicate, Move,
and Rename operations update both sides and their behavior references in one
command boundary. Tabs always retain one pair; trigger and panel counts match,
each trigger targets exactly one panel, and no pair can be orphaned. Managed
internals are represented semantically in Layers and cannot be independently
removed, duplicated, reparented, or moved through generic structural controls.

The same ownership predicate is shared by contracts, the GrapesJS adapter,
placement, Layers, Inspector, and editor commands. UI hiding is supplementary;
the command and placement layers reject invalid operations even when invoked
outside the friendly controls.

## Gallery recipe

New Gallery entries are recipes, not a new semantic runtime. The presets create
normal Grid + Image primitives with safe placeholder image sources. Users can
edit columns, gap, responsive styles, image sources, order, and image count
using the existing primitive controls. New payloads contain no Gallery semantic
node and the renderer follows the normal Grid/Image path. Legacy Gallery nodes
remain readable and render through their compatibility path.

## Runtime semantics

- A List renders `<ul>` when `ordered` is false and `<ol>` when it is true.
- V8 FAQ uses the bounded accessible disclosure runtime with buttons, expanded
  state, controls/label references, visible answer regions, initial defaults,
  and single/multiple-open behavior.
- V8 Tabs render `tablist`, `tab`, and `tabpanel` semantics with
  `aria-selected`, `aria-controls`, and `aria-labelledby`. Horizontal tabs use
  Left/Right/Home/End; vertical tabs use Up/Down/Home/End. Enter/Space support
  manual activation where applicable. Preview and public rendering share the
  same renderer/runtime contract.
- Gallery recipes render only through existing Grid and Image renderers.

## Permissions and responsive editing

The existing Phase 21 permission model remains authoritative. Content-only
users may edit List text, FAQ questions/answers, Tab labels, and content inside
panels when the registry marks it content-scoped. They cannot add, remove, or
reorder compound items, change Tabs orientation, or change design structure.
Designers retain structural controls, and the server-side `page.design` guard
remains the authority over UI visibility.

All native features use the existing V8 style vocabulary, inherited responsive
values, reset overrides, and viewport editing. No arbitrary CSS, HTML, or
runtime expressions were added.

## Compatibility and migration

V1–V7 contracts and their legacy renderer paths are unchanged. The explicit
legacy-to-V8 migration seam maps supported legacy List, Accordion, Tabs, and
Gallery data into native V8 structures when promotion is requested. The
mapping is deterministic, non-mutating, preserves content/order/styles where
the contracts permit, remaps IDs and references safely, and retains a
compatibility representation when a case cannot be converted losslessly.

Canonicalization is deliberately not the migration engine. It normalizes and
repairs V8 input at boundaries: safe unique IDs, minimum compound cardinality,
orphan behavior cleanup, valid tab references, pair consistency, and the
single-open disclosure invariant. It does not silently rewrite compatibility
nodes into forward nodes on every load or save. Promotion is explicit through
the existing migration/insertion seam.

## Security and non-goals

Phase 24 adds no arbitrary HTML, JavaScript, `eval`, `Function` constructor,
custom expressions, unsafe CSS, unsafe URL contract, custom state machine, or
general low-code state engine. Runtime state is bounded to disclosure open
state and Tabs active state, with system-managed identifiers.

AI generation/editing, experimentation, collaboration, comments, autosave,
custom code, iframe/plugin systems, reusable-content expansion, broad
navigation/collection redesign, and other feature families remain out of
scope.

## Test strategy

Contract tests cover List identity/cardinality/ordering, disclosure ownership
and single-open repair, Tabs pair/reference integrity and remapping, Gallery
recipes, migration non-mutation/determinism/idempotence, and canonicalization.
CMS tests cover aggregate Inspector controls, stable drafts, command rejection,
Undo grouping, identity remapping, Layers semantics, and content/design mode.
Renderer tests cover List tags, disclosure behavior, Tabs ARIA/keyboard state,
and primitive Gallery rendering. The dedicated browser release journey is
`tests/e2e/phase-24-native-open-composition.spec.ts` and covers Builder,
save/reload, Preview, UI Publish, public interaction, responsive editing, and
uncaught-console-error checks.

The exact final command results, local merge SHA, and any baseline skipped
integration tests are recorded in
`docs/continuity/phase-24-final-handoff.md`.
