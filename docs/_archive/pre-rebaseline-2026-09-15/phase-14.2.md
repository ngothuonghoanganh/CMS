# Phase 14.2 — Builder Inspector, State Synchronization & UX Consolidation

## Goal

Make Canvas, Layers and Inspector predictable views of one GrapesJS live
document while keeping PagePayload as the persisted contract. This phase does
not add Phase 15 components or a second document model.

## Audit findings

- Content previously rendered quick style sections and alignment alongside
  semantic fields.
- `props.align` and `style.textAlign` both acted as alignment writers.
- Responsive controls read only the authored active block, so inherited values
  appeared blank.
- Layers and the page extension graph were rendered below Add.
- The context toolbar was fixed to the canvas header instead of the selected
  node.
- The Inspector contained duplicate action surfaces for duplicate/delete/move.

## Property ownership model

| Surface                           | Owns                                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| Content                           | Text, button label/link/target, image source/alt, form fields/messages, countdown label/time |
| Style                             | Registry-declared layout, size, spacing, typography, background, border and effects          |
| Settings                          | Element/accessibility guidance and collapsed technical metadata                              |
| Context toolbar, Layers, keyboard | Move, duplicate, delete, parent and quick add                                                |

Property-level audit:

| Property                      | Canonical payload                | Canonical UI                    | Responsive | Legacy handling                         |
| ----------------------------- | -------------------------------- | ------------------------------- | ---------- | --------------------------------------- |
| Text / button label           | `props.text` / `props.label`     | Content                         | No         | None                                    |
| Button link / target          | `props.href` / `props.target`    | Content                         | No         | None                                    |
| Image source / alt            | `props.src` / `props.alt`        | Content source composite        | No         | URL remains supported                   |
| Form fields / messages        | `props.form`                     | Content                         | No         | Existing form schema                    |
| Countdown label / time        | `props.label` / `props.targetAt` | Content                         | No         | Existing countdown schema               |
| Width, height, spacing        | `style.*`                        | Style > Size / Spacing          | Yes        | None                                    |
| Typography / colors / effects | `style.*`                        | Style groups                    | Yes        | None                                    |
| Text alignment                | `style.*.textAlign`              | Style > Typography              | Yes        | `props.align` is renderer fallback only |
| Node identity                 | `id`                             | Settings > Advanced (read-only) | No         | Stable ID                               |

`PAGE_COMPONENT_STYLE_CAPABILITIES` and `styleSchemaFor()` in the contracts
package are the single style capability source. Component definitions no longer
inherit every style property.

## State synchronization

`selectedNodeId` is the shell identity. GrapesJS component instances are
resolved from that ID and emitted as snapshots. GrapesJS `component:input` (the
documented RTE input event), `component:update` and selection events refresh the
snapshot, so inline text edits update Content without reselecting. Inspector
mutations continue to use `editor-commands.ts`; an active RTE is asked to end
before a property command is applied.

## Responsive effective values

`apps/cms/builder/inspector/inspector-value.ts` provides
`resolveInspectorStyleValue()`. Controls display the effective desktop → tablet
→ mobile value and separately track `authoredValue`, `inherited` and
`sourceViewport`. Reset removes only the active tablet/mobile override.

## Text alignment compatibility

`style.textAlign` is the canonical visual source. Existing `props.align` values
remain valid as a renderer/adapter fallback when no base style alignment exists.
New Inspector alignment edits dispatch `set-responsive-style` and do not create
new `props.align` values. The production renderer gives authored style
alignment precedence over the legacy prop.

## Builder information architecture and geometry

The left rail now contains Add, Layers, Assets and Page settings. Add uses
registry-derived Layouts/Elements categories; Layers and extension graph data
are no longer mixed into Add. The context toolbar is rendered in the canvas
editor shell and positioned from selected node geometry, viewport origin and
zoom, with a below-node fallback near the top edge. Small screens use overlay
drawers so the canvas remains the primary workspace.

The Inspector is implemented in `builder/inspector/builder-inspector.tsx`; the
shell owns live editor/save state and passes command callbacks into the
Inspector instead of embedding control rendering alongside workspace layout.
Technical capability counts are collapsed under Page settings.

Spacing keeps the existing CSS string payload and parse/format helpers while
presenting a compact box-model treatment with linked/unlinked controls.

## Files changed

- `packages/contracts/src/component-registry.ts`
- `apps/cms/builder/inspector/inspector-value.ts`
- `apps/cms/builder/inspector/builder-inspector.tsx`
- `apps/cms/builder/builder-shell.tsx`
- `apps/cms/builder/grapes-editor.tsx`
- `apps/cms/builder/canvas/builder-context-toolbar.tsx`
- `apps/cms/builder/canvas/quick-add-overlay.tsx`
- `apps/cms/app/ui/fields.tsx`
- `apps/cms/app/globals.css`
- `apps/renderer/app/renderer.tsx`

## Tests

Added resolver, registry capability and renderer alignment coverage. CMS,
contracts and renderer unit suites pass locally. Builder Playwright tests now
use the Phase 14.2 selectors and validate effective responsive values and the
canonical style alignment payload.

## Known limitations

- GrapesJS still owns its native UndoManager grouping for RTE sessions.
- Panel resizing is deferred; sensible min/max widths and mobile overlays are
  provided.
- The minimap remains available as a collapsible-style navigator surface.
- The full repository Playwright run still has pre-existing environment/test
  debt: the tenant-extension fixture can return `409`, the parity screenshot
  threshold reports a visual delta after the editor chrome changes, and a
  repeated full run can cascade into `ERR_CONNECTION_REFUSED` when a dev
  server exits. The focused CMS and forms builder suites pass with the Phase
  14.2 IA selectors.

## Phase 15 readiness

**YES for the architecture gate.** A new component should define its registry
content properties and style capabilities, add adapter/renderer mappings and
tests; the Inspector derives style controls from the registry rather than a
new `selected.type` branch.
