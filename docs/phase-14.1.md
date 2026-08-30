# Phase 14.1 — Editor Core Hardening & Residual Issues Cleanup

## Audit boundary

Phase 14 was initially marked complete at `b54423c` (`feat(cms): complete phase
14 editor interaction engine`). The previous stable boundary was `97dbd51`
(`fix builder renderer parity and inspector scrolling`). The audit reviewed the
full `97dbd51..b54423c` diff, the Builder, renderer, contracts, Pages shell,
existing architecture documents, and the Playwright journeys.

## Audit matrix

| Area                    | Status  | Evidence / risk                                                                                               | Action                                                              |
| ----------------------- | ------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Command Engine          | PASS    | Commands validate before mutation; bus now rejects stale targets and command failures                         | Kept `editor-commands.ts` authoritative                             |
| Placement Engine        | PASS    | Registry-driven `before` / `inside` / `after`, cycle and root checks                                          | Added table and edge-case coverage                                  |
| Selection Engine        | PASS    | Session stores only stable node ID and resolves live components                                               | Kept deterministic parent/root fallback                             |
| Canvas mutations        | PASS    | Block drag now commits through the same command wrapper                                                       | Removed direct UI execution path                                    |
| Layers mutations        | PASS    | Shared `MoveNodeIntent` validation and invalid status                                                         | No separate move rules                                              |
| Inspector mutations     | PASS    | Props/styles use commands and adapter validation                                                              | No direct panel model writes                                        |
| Keyboard mutations      | PASS    | Shared editable-target guard includes role textbox/contenteditable                                            | Added unit coverage                                                 |
| Quick Add               | PASS    | Uses the normal insert command with an explicit target/position                                               | No duplicate insertion algorithm                                    |
| Context toolbar         | PARTIAL | Actions are accessible and canvas-panel anchored; not yet bound to selected visual bounds                     | Keep compact toolbar; defer bounds-aware positioning                |
| Drag/drop               | PASS    | Pointer movement is temporary intent state; invalid targets show reason and do not commit                     | Kept auto-scroll and red indicator                                  |
| Cross-parent move       | PASS    | Destination and index resolve before `move`                                                                   | Added empty/forward/backward/before tests                           |
| Stable IDs              | PASS    | Add IDs are new; moves preserve IDs; clone repair regenerates subtree Page IDs                                | Clone repair runs inside command path with native fallback          |
| Duplicate subtree       | PASS    | Adapter test covers every Page node in a subtree; semantic form IDs are untouched                             | No new component-specific IDs introduced                            |
| Undo/redo               | PARTIAL | GrapesJS `UndoManager` remains the sole owner; focused style/structural flows are one-step                    | Multi-node convenience insertion can still be two native operations |
| Dirty state             | PASS    | Command commits emit one dirty revision; native events remain bridged                                         | Added no-op command/error protection                                |
| Save/conflict           | PASS    | Mutation sequence and payload comparison keep newer edits dirty                                               | Existing immutable version/conflict flow preserved                  |
| Preview bridge          | PASS    | Document snapshots are coalesced to one animation frame; selection/UI state is not posted                     | No save debounce added                                              |
| Responsive state        | PASS    | Viewport switching is presentation-only and no longer captures/mutates payload                                | Style deltas remain command-owned                                   |
| Renderer parity         | PARTIAL | Contract/geometry parity passes; one desktop screenshot retains a known 63-pixel rounded-edge antialias delta | Track as capture-environment tolerance debt                         |
| Builder shell ownership | PARTIAL | Shell still orchestrates broad panels and save flow                                                           | No risky mechanical split in hardening phase                        |
| Unit tests              | PASS    | 52 CMS tests pass, including placement, commands, IDs, style and keyboard guards                              | Added architecture-focused tests                                    |
| E2E                     | PARTIAL | Focused Builder journeys pass; broad suite has two known fixture/capture failures                             | Documented below; no timeout masking                                |

## Issues found and root causes

1. Palette block drag called `executeEditorCommand` directly, skipping the
   commit wrapper that coordinates dirty state, selection, preview and canvas
   updates.
2. An insertion command with a missing `targetId` could fall back to the root.
3. Viewport switching held `internalChangeRef` for 500ms and captured displayed
   styles, allowing a fast user edit to be suppressed and making a UI-only
   action look like document mutation.
4. Serialization and viewport paint repeatedly wrote identical style/model
   values, creating avoidable event and history noise.
5. Keyboard handling did not guard semantic `[role="textbox"]` targets.
6. Clone identity repair lived primarily in a clone event, separate from the
   command that owns duplicate semantics.
7. Global GrapesJS keymaps could observe the same shortcut after the CMS
   handler, causing a second undo/redo/delete for one physical key event.

## Architecture decisions

### Command ownership

User document changes follow:

```text
Canvas / Layers / Inspector / Quick Add / Toolbar / Keyboard
    -> EditorCommand bus
    -> placement + adapter validation
    -> GrapesJS live model
```

The command bus rejects invalid commands before mutation and treats adapter
errors as safe no-ops. UI code does not call component mutation APIs directly.

Allowed direct editor mutations are limited to initial payload hydration,
editor-only form preview decoration, runtime DOM classes, presentation-only
viewport paint, selection, and the guarded native clone fallback. User add,
remove, move, duplicate, prop, and style changes must use the command boundary.

### Placement ownership

`builder-placement.ts` is the single source for registry-derived parent/child
rules, cycle checks, destination resolution, and deterministic sibling indices.
Canvas, Layers, keyboard movement and Quick Add all consume `MoveNodeIntent`.

### Selection ownership

`BuilderSelection` stores only `selectedNodeId` for the session. GrapesJS
components are resolved on demand; delete, undo and redo select a surviving
component without persisting editor UI state in `PagePayload`.

### History ownership

GrapesJS `UndoManager` remains the only history owner. Clone ID repair runs under
GrapesJS' skip facility so it does not create a second history entry, and the
new clone actions are isolated into one command history group. A small
multi-operation convenience insertion (auto-section plus child) remains a
documented limitation until a native transaction/grouping API is introduced.

### State ownership

| State                                   | Owner                                         |
| --------------------------------------- | --------------------------------------------- |
| Live document                           | GrapesJS model inside `GrapesEditor`          |
| Persisted document                      | `PagePayload` / immutable PageVersion API     |
| Selected node                           | `BuilderSelection` + shell selection snapshot |
| Viewport                                | GrapesEditor UI ref + shell viewport state    |
| History                                 | GrapesJS `UndoManager`                        |
| Dirty revision                          | Builder shell mutation sequence               |
| Saving/error/conflict                   | Builder shell save state machine              |
| Drag intent                             | Canvas/Layers local interaction state         |
| Active panel/inspector/collapsed layers | Builder shell UI state                        |

None of the latter UI states are serialized into `PagePayload`.

## Performance and safety findings

- Preview updates are coalesced on `requestAnimationFrame`; pointer movement,
  selection, panel state and breadcrumbs never serialize or post a document.
- Viewport paint compares style values and runs under GrapesJS' skip facility.
- Repeating an authored responsive value is a command no-op, so it does not
  advance dirty state or history.
- Responsive serialization is now read-only; style commands are the only path
  that write responsive deltas.
- The existing origin-checked preview bridge, PagePayload schemas, style safety
  checks, extension validation, RBAC and tenant scoping were not relaxed.

## Tests and regression results

Passing checks:

- `pnpm --filter @payload/cms test` — 52 tests.
- `pnpm --filter @payload/cms typecheck`.
- Focused Playwright journeys for palette drag, canvas/layer reparenting,
  invalid drops, duplicate/delete/undo/redo, responsive viewport switching,
  keyboard commands and live preview.
- Repository `pnpm verify` after the hardening changes.

The final broad `pnpm test:e2e` run is 48/50: one tenant-extension API test
returns an existing 409 fixture conflict, and the parity screenshot retains the
known 63-pixel rounded-edge antialias difference. All CMS Builder tests pass in
the final broad run; no timeout was increased to hide these results.

## Known limitations

- Context toolbar positioning is compact/canvas-panel anchored rather than
  selected-bounds aware.
- Auto-section convenience insertion is two native GrapesJS operations.
- GrapesJS native inline editing remains limited to plain text serialization;
  custom rich text is intentionally out of scope.
- Full renderer-backed canvas migration, autosave/checkpoints, collaboration,
  and new component families remain future work.

## Phase 15 readiness

**YES — with the documented limitations above.** Adding a new component should
continue to require a registry definition, adapter/renderer mapping, and
round-trip/placement/parity tests; it should not require a new interaction
architecture.

## Recommended next phase

Phase 15 may begin with the first component expansion only after preserving the
command, placement, selection, PagePayload and renderer invariants described
here.
