# Phase 14 — Editor Core & Interaction Engine

> Historical note: Phase 14 was initially marked complete at `b54423c`.
> Phase 14.1 audited the `97dbd51..b54423c` implementation and hardened
> residual ownership, viewport, serialization, clone identity and keyboard
> paths. See [`phase-14.1.md`](phase-14.1.md) for the audit matrix and results.

## Goal

Phase 14 consolidates Builder mutations and interaction state while preserving the
existing Model A boundary: GrapesJS owns the live edit document, `PagePayload` is
the validated persisted contract, and the renderer remains production authority.

## Previous architecture and problems found

The Builder already had an `executeEditorCommand` helper, but several surfaces
called it with their own insertion and selection decisions. Canvas and Layers also
had separate drag controllers. Selection summaries kept a GrapesJS component
reference, which could become stale after deletion or history replay. Layers showed
drop position without asking the same placement validator used at commit time.

## Architecture implemented

- `builder-placement.ts` is the single placement boundary for `before`, `inside`,
  and `after`. It validates registry parent/child rules, root restrictions,
  self/ancestor moves, missing nodes, and deterministic sibling indices before mutation.
- `editor-commands.ts` remains the CMS command boundary and now exposes a
  `createEditorCommandBus` façade. Insertions validate the component registry and
  can target an explicit sibling position; property mutations protect stable node
  identity and sanitize inline text.
- `builder-selection.ts` owns session selection as `selectedNodeId`. GrapesJS
  components are resolved from that id; deletion and history fall back to a
  deterministic surviving parent/root.
- Canvas, Layers, keyboard movement, Inspector, and Quick Add use the same command
  and placement paths. `PagePayload` and the existing immutable version/save flow
  are unchanged.

## Interaction changes

- Layers displays invalid drop styling and an accessible reason before commit.
- Canvas invalid targets retain a red insertion indicator with an explanatory title
  instead of silently hiding the target.
- A compact context toolbar provides parent, move up/down, duplicate, delete, and
  Quick Add actions. Quick Add inserts at the selected node's `inside` or `after`
  position through the normal insert command.
- Delete/Backspace, Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z (and Ctrl+Y), Cmd/Ctrl+D, Escape,
  and existing V/H/Space controls are guarded from text fields and contenteditable
  inputs. Canvas Escape cancels an active drag.
- Button labels are GrapesJS-inline editable; serialized text and labels are
  sanitized to plain text at the PagePayload boundary.

## History, dirty state, save, and preview

GrapesJS `UndoManager` remains the only history owner. Command commits suppress
duplicate observer notifications and emit one dirty/document/selection update;
native GrapesJS edits continue through its existing event bridge. Dirty state and
conflict-safe immutable version saves in `builder-shell.tsx` are unchanged. Preview
continues to receive only the validated `PageDocument` snapshot.

## Files changed

- `apps/cms/builder/builder-placement.ts`
- `apps/cms/builder/builder-selection.ts`
- `apps/cms/builder/editor-commands.ts`
- `apps/cms/builder/builder-interaction.ts`
- `apps/cms/builder/grapes-editor.tsx`
- `apps/cms/builder/builder-shell.tsx`
- `apps/cms/builder/canvas/builder-context-toolbar.tsx`
- `apps/cms/builder/canvas/quick-add-overlay.tsx`
- `apps/cms/builder/builder-adapter.ts`
- `apps/cms/app/globals.css`
- `apps/cms/builder/builder-placement.spec.ts`

## Tests

The focused CMS suite covers placement validation, same-parent ordering,
cross-parent reparenting, invalid relationships, adapter round-trips, extension
parity, and save acknowledgement. Run `pnpm --filter @payload/cms test` and the
existing Playwright Builder journeys for persistence and renderer parity.

## Known limitations and deferred work

GrapesJS remains the live editor engine; the renderer-backed semantic canvas and
typed preview selection protocol remain deferred. GrapesJS's native inline editing
still emits model events directly, but serialization is constrained to PagePayload
and sanitized text. Quick Add currently reports registry-invalid positions rather
than disabling each option with a per-option reason. Autosave, checkpoints,
collaboration, AI operations, design tokens, and a larger component catalog remain
future phases.
