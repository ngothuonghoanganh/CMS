# Phase 17.1 — Stability, Identity, Global Correctness & Builder Discoverability

## Status

**PHASE 17.1 IMPLEMENTED:** the hardening scope is complete in the working
tree. Phase 18 feature breadth remains out of scope.

## Root cause and identity flow

The duplicate command previously called the native `tlb-clone` command and
reassigned IDs after the clone had entered the live GrapesJS tree. That made a
stale identity observable during component lifecycle events and could leave
compound descendants sharing PagePayload IDs.

`apps/cms/builder/builder-node-identity.ts` is now the canonical identity
service. It exposes:

- `collectPersistedNodeIds`
- `generateFreshNodeId`
- `remapSubtreeNodeIds`
- `assertUniquePersistedNodeIds`
- `findDuplicatePersistedNodeIds`

The command boundary snapshots a source subtree, reserves IDs against the
current document, remaps the complete definition, and only then appends it.
All normal insert, Quick Add, structural insert, preset, and duplicate paths
use the same boundary. The root sentinel remains `root`; supported ID
references are remapped with the subtree. Duplicate is one command and one
Undo/Redo boundary. Serialization validates identity and reports duplicates;
it never silently repairs a saved document.

## Global save and preset semantics

Header and footer documents retain the canonical shape:

```text
root (id: root)
└── exactly one global-header or global-footer
```

The contract rejects missing, wrong, or multiple region roots. A global preset
is registry metadata with `replace-root-children` apply mode. It replaces the
children of the existing semantic region, preserving the single root and its
identity. A non-empty region requires explicit confirmation, and the replace
is one command/Undo action.

Global save now follows:

```text
serialize live editor → validate SiteGlobalPayloadV1 → merge SiteGlobals
→ PATCH site globals → parse server response → replace local cache with ACK
```

Invalid/network/permission errors remain visible. Missing legacy globals use a
safe default; invalid persisted globals fail loudly. A failed save returns a
failed result to document switching, so the dirty document stays active.

## Catalog UX — composition previews V2

`BuilderPreviewNode` in the contracts package is the finite preview DSL. It
contains only approved local primitives (`row`, `column`, `box`, `text`,
`image`, `button`, `form`, `accordion`, `tabs`, `gallery`, and the other
registered semantic shapes), so catalog metadata cannot inject arbitrary HTML
or JSX. `BuilderBlockPreview` recursively renders this tree with local CSS and
exposes a deterministic composition fingerprint for regression tests.

Primitive component entries use the registry's semantic tree. Presets and
global presets are resolved by `builder-preview-model.ts` from the same
GrapesJS `ComponentDefinition` returned by their `create` factory. The resolver
reads the actual node hierarchy, grid/flex direction, alignment, tone, and
compound child counts. Consequently Hero, CTA, Two Columns, Vertical Stack,
and each global preset retain visibly different composition previews; there is
no category-generic fallback card.

Search includes label, type, preset ID, description, keywords, group, and
extension ID. The full block name remains readable in the card, while a
portal-based tooltip repeats it on hover and keyboard focus so it is not
clipped by the scrollable catalog panel.

## Resizable builder panels

On desktop widths above `1100px`, the left catalog panel and right inspector
have keyboard-accessible separator handles. Pointer movement uses pointer
capture plus a parent-document resize shield, so dragging across the GrapesJS
iframe keeps the same resize session. Left and right widths are constrained to
usable ranges (`220–480px` and `280–640px` hard caps respectively) while
preserving a `420px` minimum canvas where the viewport permits it.

Widths persist independently under `payload-builder-left-panel-width` and
`payload-builder-right-panel-width`. Collapse hides a panel without discarding
its width, so expanding it restores the previous geometry. At `1100px` and
below the desktop resizers disappear and the existing responsive dock/overlay
layout takes over; catalog cards use an inline container query to switch to a
two-column arrangement when the available panel width supports it.

## Verification and remaining debt

Run the repository verification commands with Node `v24.11.0` and pnpm
`10.15.0`. The Phase 17.1 focused E2E covers compound identity, recursive
fresh IDs, composition-derived catalog previews/search/tooltips, resizer
pointer and keyboard behavior, iframe crossing, collapse restore, persistence,
responsive fallback, exact global root cardinality, and
confirmation-aware preset replacement. The existing Phase 17 E2E covers
global save/reload, isolation, publishing, and public delivery. The corrected
catalog-density regression was also rerun successfully through the existing
canvas drag/save/reload test.

The final full Playwright run executed 61 tests: 59 passed. Two stable
baseline failures remain tracked: tenant extension disable returns `409` where
its test expects `201`, and desktop builder/renderer screenshot parity
exceeds its existing threshold. The existing canvas drag/save/reload path and
the new Phase 17.1 focused gate both pass after catalog density was tuned to
keep the Text drag handle reachable in the default viewport.
