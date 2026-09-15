# Phase 22 — Open Composition Builder

Phase 22 adds the V8 Open Composition payload alongside the immutable V1–V7
contracts. Legacy payloads remain the compatibility and published-read path
for existing versions. A legacy page is promoted to V8 only when an Open
Composition recipe is inserted, at which point the current draft is migrated
and the new composition is appended.

## Delivered

- `OpenCompositionNode` separates primitive visual nodes from semantic nodes.
- `OPEN_COMPOSITION_REGISTRY` is the single nesting/capability registry.
- `field`, `action`, and `state-binding` behaviors carry relationships outside
  visual node props.
- The payload is bounded to 200 nodes, depth 24, 200 behaviors, and 256 KiB.
- Legacy migration expands the closed Form widget into Form, Form Field, Label,
  Input/Textarea, and submit Button nodes without mutating the source payload.
- GrapesJS can hydrate, edit, and serialize V8 nodes. Recipe behaviors are
  merged from inserted subtrees at serialization time.
- Canvas selection, Layers, Inspector scalar/style edits, structural movement,
  duplication, deletion, and undo/redo use the same command boundary for V8
  nodes.
- The Contact Form recipe is available in the builder preset catalog.
- The public renderer renders V8 nodes as real HTML controls. The API projects
  V8 form behaviors back to the existing `FormProps` submission and integration
  contract, so public endpoints remain backward compatible.

## Compatibility rules

V1–V7 are never rewritten in place. `PagePayloadSchema` accepts V1–V8, while
renderer and API adapters dispatch V8 explicitly and retain legacy behavior for
V1–V7. The builder uses lazy promotion at the Open Composition feature
boundary, so opening a legacy page alone does not create a new V8 draft.
Closed widget `partsStyle` remains valid for old payloads; new features should
use child nodes and behaviors.

## Validation

Contract, builder adapter, editor-command, renderer, and API form-adapter tests
cover registry rules, semantic reference integrity, recipe ID remapping,
legacy-to-V8 promotion, GrapesJS round-trips, real V8 controls, behavior
lifecycle on duplicate/delete, and stable submission projection.
