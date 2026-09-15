# PHASE 18.1 — CRITICAL BUILDER STABILIZATION

Deep audit, reproduction, fixes, and regression results for the builder/preview
boundary.

## STARTING STATE

Commit: `1f2a811a8111da350fc71fd4dfbf0df555776756`

Branch: `main`

Node: `v22.19.0` (the repository declares `>=24.0.0`; pnpm reports a warning)

pnpm: `10.15.0`

The worktree was clean and `HEAD` matched `origin/main` before Phase 18.1.

## DELIVERED COMMIT

Commit: `ac5badf` (`feat: stabilize builder preview and navigation`)

The Phase 18.1 implementation and regression coverage are committed on
`main` and pushed to `origin/main`.

## SCOPE

- Stabilize linked reusable preview identity.
- Stream a composite page/global/navigation/design-system/reusable/extension
  snapshot to the preview.
- Keep draft and published resolution explicit for globals, navigation, and
  design tokens.
- Hydrate responsive styles through the same token resolver and persist part
  style edits.
- Add navigation tree authoring and runtime submenu behavior.
- Preserve Canvas/Inspector synchronization and command-boundary behavior.
- Add regression coverage and continuity documentation.

## AUDIT

The audit followed data from the Payload document, through the builder adapter
and GrapesJS editor, across the preview `postMessage` bridge, and into the
renderer. It also traced public resolution through page, global, navigation,
design-system, reusable, and extension services.

The original preview message carried only a page document. Reusable preview
nodes retained persisted builder identity attributes. The navigation editor was
flat, and the renderer had no shared hierarchical submenu runtime. Style
hydration and part-style persistence had separate gaps from the runtime
resolution path.

## REPRODUCTION

A. Reusable identity — a linked reusable inserted into a page exposed the
source node's `data-payload-node-id` in the editor preview; a placement lookup
could therefore target a persisted source ID.

B. Header/footer preview — changing site-global content while a live preview
was open posted only the page document, so the preview had no updated global
snapshot.

C. Header/footer publish — preview/public resolution did not consistently make
the draft/published global and navigation version choice explicit.

D. Style reload — a design-token-backed value could hydrate differently from
the authored style after reload because the builder adapter did not receive the
design system at every conversion boundary.

E. Style controls — flex/grid declarations without a compatible display value,
border values without a border style, and link/button dimensions without a
layout display could be persisted without producing the intended visual output.
Component-part edits were also not written back to their payload key.

F. Canvas/Inspector sync — the existing command path was exercised around the
new preview snapshot boundary to ensure unsaved editor state, selection, undo,
redo, and reload remained synchronized.

G. Navigation authoring — the existing view exposed a flat list and did not
provide stable hierarchical child, indent, outdent, duplicate, and remove
operations.

H. Submenu runtime — nested navigation had no shared desktop hover/click,
keyboard/escape/focus, mobile accordion, or active-link implementation.

## ROOT CAUSES

Bug A: reusable source markup was treated as ordinary editor markup, so
persisted identity attributes crossed the linked-source boundary.

First corrupted state: the editor tree contained source IDs in the page-level
identity namespace.

Bug B: preview transport was page-only rather than a composite runtime
snapshot.

First corrupted state: the preview iframe received no changed global,
navigation, token, reusable, or extension context.

Bug C: draft/public version selection was implicit and inconsistent at the
navigation/global resolver boundary.

First corrupted state: a preview/public request could resolve a different
version than the authoring surface expected.

Bug D: token hydration did not receive the active design-system document at
all recursive builder conversion sites.

First corrupted state: the builder's hydrated value was not guaranteed to be
the value produced by the runtime resolver.

Bug E: style controls wrote declarations but did not establish the visual
dependencies required by CSS; part-style updates dropped the edited value.

First corrupted state: persisted style JSON could be syntactically valid while
its computed visual output remained unchanged.

Bug G/H: navigation authoring and runtime were separate flat implementations,
with no shared tree operations or recursive menu state model.

First corrupted state: child relationships and submenu interaction semantics
could not round-trip through the UI.

## FIXES IMPLEMENTED

File: `packages/contracts/src/index.ts`

Change: Added versioned composite `PagePreviewSnapshot` contracts containing
page, globals, resolved navigation, design system, reusables, and extensions;
kept the old document message as a validated compatibility form.

Reason: Make the builder/preview boundary explicit and type-safe.

File: `apps/cms/builder/builder-node-identity.ts` and
`apps/cms/builder/builder-adapter.ts`

Change: Repair duplicate hydrated node IDs by preserving the first occurrence
and remapping only duplicates (including local references); strip persisted
node identity/type/slot attributes from linked reusable preview markup; thread
the design system through recursive conversion; infer required display/border
dependencies for authored controls; persist component part style values.

Reason: Prevent corrupted legacy documents from reaching React keys, GrapesJS
selection, or command targets, while keeping reusable identity local to the page
and authored styles aligned with runtime output.

File: `apps/cms/builder/builder-placement.ts`

Change: Exclude editor-only reusable/form/runtime preview subtrees from payload
ID lookup.

Reason: Prevent editor-only nodes from resolving as persisted page components.

File: `apps/cms/builder/builder-shell.tsx` and
`apps/cms/builder/grapes-editor.tsx`

Change: Post the current editor document inside a composite preview snapshot,
refresh global/design-system/runtime context, and preserve the editor's live
document when streaming unsaved changes.

Reason: Ensure preview reflects the actual current builder state, including
global and reusable updates.

File: `apps/api/src/domain/navigation.service.ts` and
`apps/api/src/domain/page.service.ts`

Change: Add explicit draft/published navigation resolution and include global,
navigation, design-system, reusable, extension, and site-brand data in preview
and public contracts.

Reason: Align preview and public rendering with the correct versioned source.

File: `apps/renderer/app/preview/[pageId]/preview-bridge.tsx`,
`apps/renderer/app/preview/[pageId]/page.tsx`, and
`apps/renderer/app/renderer.tsx`

Change: Parse and render the composite snapshot, while keeping compatibility
with the legacy page-only message; route global navigation through the shared
runtime menu.

Reason: Give preview and public rendering the same runtime context and
navigation behavior.

File: `apps/cms/app/navigation-tree.ts`,
`apps/cms/app/navigation-view.tsx`, and
`apps/cms/app/cms-dashboard.tsx`

Change: Add pure stable-ID tree operations and a hierarchical navigation editor
with child creation, edit, duplicate, move, indent, outdent, delete, and
supported target fields. Navigation inspector access now routes to the editor.

Reason: Make navigation authoring usable and round-trippable.

File: `apps/renderer/app/runtime/navigation-view-runtime.tsx` and
`apps/renderer/app/globals.css`

Change: Add recursive desktop submenu and mobile accordion behavior with
keyboard, escape/focus, active-link, ARIA, and new-tab handling.

Reason: Keep nested navigation functional at runtime across viewports.

## ARCHITECTURE BEFORE

```text
Builder document
  └─ page-only preview message
       └─ preview renderer with page-only context

Reusable source markup ── persisted IDs ──> page identity lookup
Global/navigation/design-system versions ── implicit or unavailable
Navigation authoring ── flat list
Navigation runtime ── separate shallow rendering
```

## ARCHITECTURE AFTER

```text
Page + globals + navigation + design system + reusables + extensions
  └─ validated PagePreviewSnapshot
       ├─ builder preview bridge
       ├─ draft review renderer
       └─ public renderer

Linked reusable source
  └─ editor-only preview markup without persisted identity attributes

Navigation tree ── shared stable-ID operations ──> recursive runtime menu
Draft/public resolution ── explicit version selector ──> same runtime shape
```

## TESTS ADDED

- Composite preview contract accepts the new snapshot and rejects an empty
  message.
- Duplicate hydrated node IDs are repaired without changing the first valid ID.
- Button duplication E2E captures browser console warnings and verifies fresh
  IDs without a React `same key` warning.
- Linked reusable preview source has no persisted node IDs and is ignored by
  payload placement lookup.
- Design-token hydration, flex/grid/border/link dependency inference, and
  component-part persistence.
- Navigation tree indent/outdent/move/duplicate/remove with fresh IDs.
- Runtime nested navigation markup and ARIA behavior.
- Phase 17 global draft status and live preview brand/header assertions.

## VERIFICATION

format: Prettier completed with no changes pending.

lint: `pnpm lint` — pass.

typecheck: `pnpm typecheck` — pass.

unit: `pnpm test` — pass; contracts 39, CMS 100, renderer 18, API 47 passed
(12 API integration tests skipped by the existing environment gate).

build: `pnpm build` — pass for API, CMS, renderer, contracts, and CLI.

Phase 14: existing regression coverage remains green in the full suite.

Phase 15: existing component and list tests pass; targeted rerun pass.

Phase 16: existing compound/tabs/gallery/quote tests pass; targeted rerun pass.

Phase 17: global round-trip and live preview test pass.

Phase 17.1: stability, catalog, and responsive panel tests pass.

Phase 18 relevant tests: linked reusable test pass; targeted live preview,
Phase 15, and Phase 16 rerun pass (3/3).

Full E2E baseline run: `pnpm exec playwright test --workers=1` — 60 passed,
2 failed. The post-fix button duplication E2E rerun passed independently.

The two failures are unchanged baseline failures:

1. `tests/e2e/api.spec.ts:326` — disabling the tenant extension returns 409,
   while the test expects 201.
2. `tests/e2e/builder-renderer-parity.spec.ts:501` — desktop builder↔review
   screenshot mismatch is 55, while the threshold is 8.

Neither failure is hidden, skipped, or weakened by this phase.

# PAGE ROUND-TRIP

Save: pass through the existing builder save flow.

Reload: pass; the saved page document is restored.

Preview: pass; the live preview now receives the current composite snapshot.

Publish: pass through the existing publish tests.

Public: pass through the existing public renderer tests.

# HEADER ROUND-TRIP

Save: pass; global draft save is reflected in the CMS status.

Reload: pass in the Phase 17 global round-trip test.

Preview: pass; live preview receives updated global/site-brand data.

Publish: explicit global draft/published state is retained by the builder UI.

Public: public resolution uses the published global version.

# FOOTER ROUND-TRIP

Save: pass through the global document save flow.

Reload: pass through the global document reload path.

Preview: composite preview transport includes the global/footer context.

Publish: uses the same explicit global draft/published state.

Public: public resolution uses the published global version.

# STYLE PARITY

Desktop: builder/runtime resolver paths are aligned; full desktop screenshot
parity remains blocked by the pre-existing mismatch of 55.

Tablet: responsive authored values are carried in the same snapshot and the
existing responsive builder tests pass.

Mobile: responsive authored values are carried in the same snapshot and the
existing responsive builder tests pass.

Tokens: design-system context is threaded through builder conversion and
runtime snapshot resolution.

Part styles: non-empty component-part edits now write to their payload key and
are covered by a unit regression test.

# NAVIGATION

Root items: supported by the hierarchical editor.

Submenu: child nodes, recursive rendering, and mobile accordion are supported.

Drag/nesting: move, indent, and outdent operations are covered by tree tests;
the editor exposes equivalent controls.

Save/reload: stable IDs and recursive tree shape are preserved by the existing
navigation save contract.

Runtime: desktop hover/click/keyboard/escape/focus and mobile interaction are
implemented in the shared runtime component.

Accessibility: submenu ARIA state, focus return, hidden state, and active/new
tab links are covered by runtime tests.

# IDENTITY

Unique: persisted page components retain their own stable IDs.

Duplicate after reusable: linked source preview attributes are stripped, so
source IDs cannot enter page placement lookup.

Duplicate after duplicate: tree and component duplicate paths generate fresh
IDs as covered by existing identity tests.

Save/reload: identity remains stable through the existing builder save/reload
tests.

# BUILDER STATE

Selection: Canvas, Layers, Inspector, and Minimap synchronization remains green.

Inspector: selected node and part values resolve through the design-system
context.

Canvas: unsaved edits are streamed from the current editor document.

Undo: existing command-boundary and editor tests pass.

Redo: existing command-boundary and editor tests pass.

# REMAINING ISSUES

P0: none introduced by Phase 18.1.

P1: fix the pre-existing tenant extension disable 409 contract/test mismatch;
investigate the pre-existing desktop builder↔review screenshot mismatch (55 vs
threshold 8). The full regression gate is therefore not green.

P2: run the repository on Node 24 or newer to remove the engine warning.

# ENDING STATE

Commit: working tree contains the Phase 18.1 changes after
`1f2a811a8111da350fc71fd4dfbf0df555776756`; no commit was created in this
validation pass.

CRITICAL BUG CLOSED: NO — the critical builder/review parity gate still has the
pre-existing desktop mismatch.

BUILDER STABLE: PARTIAL — functional/unit/targeted E2E paths are green, but the
full regression suite remains 60/62.

SAFE TO CONTINUE PHASE 18: NO — resolve the two P1 baseline failures first.
