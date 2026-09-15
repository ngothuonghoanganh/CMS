# Phase 15 Handoff — Registry-driven Components and Payload V4

Read [`phase-15.md`](../phase-15.md) for the implementation report.

## Invariants

- `PagePayload` and `PageDocument.payload` are persisted content truth.
- GrapesJS is the live editor document engine.
- `editor-commands.ts` is the authoritative user mutation boundary.
- `PAGE_COMPONENT_REGISTRY` is the semantic and placement capability source.
- `PAGE_COMPONENT_STYLE_CAPABILITIES` plus `styleSchemaFor()` are the style
  capability source.
- The production renderer is the public rendering truth.
- GrapesJS UndoManager is the sole history owner; do not introduce a second
  history store.
- `selectedNodeId` is canonical selection identity. React holds selection
  snapshots, never a copied page tree.
- Editor-only form/list/runtime preview descendants must never serialize into
  PagePayload.

## Property engine contract

The Inspector gets content definitions from
`PAGE_COMPONENT_REGISTRY[selected.type].propertiesSchema`. Primitive controls
are rendered by `property-control-renderer.tsx`; complex controls are selected
through `CUSTOM_PROPERTY_EDITORS`. Inspector callbacks dispatch semantic
properties only.

`component-editor-bindings.ts` is the CMS-only codec/validation layer. It must
not become an arbitrary JSON-path mutator. Every new binding must validate its
value and return the existing finite `EditorCommand` vocabulary. GrapesJS
`set`, `setAttributes`, `setStyle`, `components`, append/remove/move calls stay
inside command/editor infrastructure.

## Payload V4 contract

V4 adds `heading`, `link`, `divider`, `list`, and `video` while retaining all
V1–V3 node meanings. `PagePayloadSchema` is the compatibility union. New
features promote the serialized version to V4 based on the tree, not React UI
state. Old V1/V2/V3 published snapshots must continue to parse and render
unchanged.

Safety rules:

- heading and link text are plain text;
- links use safe href validation and `_blank` gets `noopener noreferrer`;
- list item IDs are stable/unique and item text is plain text;
- video sources are `/assets/` or safe `http(s)` URLs; autoplay requires muted;
- only registry-approved style keys can cross the adapter/renderer boundary.

## Component and preset contract

Each new primitive requires all of: contract/schema, registry semantics and
placement, adapter codec, property binding, renderer mapping, and tests.

Presets live in `apps/cms/builder/block-presets.ts`. They are factories for
ordinary valid trees and never create persisted `hero`, `cta` or other preset
node types. Every factory must generate fresh Page node IDs and use Style
Registry editor keys (for example `max-width`, `grid-template-columns`, and
`background-color`) so serialization cannot silently drop preset styling.

Add panel, drag insertion, Quick Add and context insertion must continue to
share the preset/component registry and the same placement command validation.

## Renderer and responsive contract

The renderer owns semantic HTML for every registered node type. Builder preview
may add only editor-only descendants/attributes and must round-trip to the same
payload. Responsive style controls use `resolveInspectorStyleValue()` and the
desktop → tablet → mobile cascade; a reset removes only the active authored
override.

## Next-phase guardrails

- Do not add a `selected.type === ...` branch to `builder-shell.tsx` or a large
  primitive-specific branch to `builder-inspector.tsx` for the next component.
- Do not widen V3 or rewrite old database versions to introduce new primitives.
- Do not persist GrapesJS HTML/CSS, editor preview children, or preset IDs as
  content truth.
- Do not bypass `editor-commands.ts` for Inspector, Canvas, Layers, Quick Add,
  or preset mutations.
- Do not introduce arbitrary HTML, script, iframe embed, custom JS, or
  provider-specific video embeds in this phase boundary.
- Preserve Phase 14.2 tests for inline Canvas ↔ Inspector synchronization,
  effective responsive values, canonical text alignment, drag/reparent,
  duplicate/delete, undo/redo, save/reload, and renderer parity.

## Follow-up debt

The list editor intentionally owns item editing in the Inspector rather than
inline RTE. Atomic history grouping for a multi-node preset and the repository's
Node 24 upgrade should be handled deliberately, with focused regressions before
changing either boundary.

## Validation handoff

- Phase 14.2 focused regression gate before implementation: CMS 56, contracts
  28, renderer 12 tests passed.
- Phase 15 unit suites: contracts 30, CMS 64, renderer 13, API 47 passed;
  API has 12 intentionally skipped integration tests.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and
  `pnpm build`: passed under Node 22.19.0 with the repository's existing Node
  `>=24` engine warning.
- `pnpm test:e2e tests/e2e/phase-15-components.spec.ts`: 2/2 passed.
- Full `pnpm test:e2e`: 44/53 passed. The nine observed failures included an
  analytics navigation timeout, extension fixture 409, screenshot parity delta,
  two pointer-drag insertion failures, and four compatibility cases. A focused
  post-fix rerun passed all six compatibility cases (Countdown, Form, auto-scroll,
  circular drop and both pointer-drag scenarios). The Phase 15 scenarios
  themselves remained green in the full run. The three full-suite failures not
  covered by that compatibility rerun were the analytics navigation timeout,
  extension fixture 409 and screenshot parity delta.
