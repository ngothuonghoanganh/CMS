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

## Catalog UX

Registry component metadata now includes a description and finite preview
metadata. Presets and global presets carry the same metadata. The reusable
`BuilderBlockCard`/`BuilderBlockPreview` renders local CSS wireframes and
component variants with label, category, and description. Search includes
label, type, description, keywords, group, and extension ID. Layouts,
elements, presets, document-kind filtering, and an empty state remain driven
by registry data; no remote preview images or per-block shell conditionals are
used.

## Verification and remaining debt

Run the repository verification commands with Node `v24.11.0` and pnpm
`10.15.0`. The Phase 17.1 focused E2E covers compound identity, recursive
fresh IDs, catalog previews/search, exact global root cardinality, and
confirmation-aware preset replacement. The existing Phase 17 E2E covers
global save/reload, isolation, publishing, and public delivery. The corrected
catalog-density regression was also rerun successfully through the existing
canvas drag/save/reload test.

The final full Playwright run executed 59 tests: 56 passed. Two stable
baseline failures remain tracked: tenant extension disable returns `409` where
its test expects `201`, and desktop builder/renderer screenshot parity
exceeds its existing threshold. One canvas reorder assertion was intermittent
in the full run and passed when isolated; it is not part of the Phase 17.1
focused gate.
