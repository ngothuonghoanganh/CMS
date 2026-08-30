# Phase 14.1 Handoff — Editor Core Hardening

## Read first

Phase 14 started at `97dbd51` and was initially marked complete at `b54423c`.
Phase 14.1 audited that boundary and hardened residual runtime paths without
changing the Site/Page model, routes, renderer contract, or save API.

## Authoritative rules

- GrapesJS owns the live editable document during a session.
- `PagePayload` / `PageDocument` is the only persisted content contract.
- `PAGE_COMPONENT_REGISTRY` owns component capabilities and placement policy.
- `PAGE_STYLE_PROPERTY_DEFINITIONS` owns authored style capability.
- `editor-commands.ts` is the user document mutation boundary.
- `builder-placement.ts` owns all structural intent validation and indices.
- `BuilderSelection` stores a session-only stable node ID, never a DOM/model
  reference as canonical identity.
- GrapesJS `UndoManager` is the sole history owner.
- The public renderer remains production output authority.

## Allowed escape hatches

These are intentionally outside user command dispatch:

- initial `setComponents` hydration;
- editor-only form preview children and runtime DOM classes;
- presentation-only viewport paint, wrapped in GrapesJS skip tracking;
- selection changes;
- the guarded native clone fallback, with Page ID repair under skip tracking.

Any new user add/delete/move/duplicate/prop/style path must go through the
command bus. Do not add a direct `append`, `remove`, `move`, `setStyle`,
`setAttributes`, or `components(...)` call to a React panel.

## Hardening details

- Missing insertion targets are rejected instead of falling back to root.
- Palette drag commits through the same dirty/selection/history/preview wrapper
  as other mutations.
- Viewport changes no longer capture or write responsive deltas and cannot
  suppress a subsequent user edit for a fixed timeout.
- Repeated style/viewport paint avoids identical model writes.
- Repeating an authored responsive value is a no-op and does not advance dirty
  state or history.
- Preview documents are coalesced to one animation frame.
- Keyboard shortcuts share `isEditableTarget`, including role textboxes and
  cross-iframe contenteditable nodes; handled shortcuts are captured before
  GrapesJS' keymap so one physical event cannot dispatch twice.
- Duplicate commands regenerate every PagePayload node ID in the duplicated
  subtree while preserving semantic IDs such as form field IDs.

## Tests

CMS unit suite: 52 tests passing. Focused Playwright coverage passes for palette
drag, reparenting, invalid drops, duplicate/delete/undo/redo, viewport switching,
keyboard editing and live preview. Broad E2E has the documented 48/50 result in
[`phase-14.1.md`](../phase-14.1.md); investigate the API fixture conflict and
rounded-edge screenshot delta before release.

## Phase 15 guardrails

For each new component, add the registry definition, adapter mapping, renderer
mapping, schema/round-trip tests, placement tests and parity coverage together.
Do not create a component-specific drag rule or a second editable document store.
