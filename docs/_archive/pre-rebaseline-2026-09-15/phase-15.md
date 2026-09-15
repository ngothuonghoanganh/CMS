# Phase 15 — Registry-driven Component Platform & Core Element Expansion

## Starting point

- Starting HEAD: `10197ed89397a67f1e8e90524cbde9e7b294c25f`
  (`feat(cms): consolidate builder inspector and spacing UX`)
- Ending HEAD: `b0459e3ead39d3a8b644c86aabebe997218a474a`
  (`feat(cms): add registry-driven component platform`). The Phase 15
  implementation is committed in that baseline; Phase 16 is the current
  uncommitted working-tree change.
- Gate 0 was run before the Phase 15 expansion. The Phase 14.2-focused CMS,
  contracts and renderer suites passed.

## Architecture before this phase

Phase 14.2 had the correct live-document boundary: GrapesJS owned the editor
tree, `PagePayload`/`PageDocument` represented persisted content, and commands
owned editor mutations. Style capabilities were already registry-driven.
However, the Inspector still had component-specific content branches and the
shell still contained form/countdown wiring. Adding another primitive would
have increased that branching surface. The V3 payload and adapter also had no
semantic representation for the new core elements.

## Decisions

### Generic property engine

`PAGE_COMPONENT_REGISTRY[type].propertiesSchema` now describes content controls
and their control kind. `builder/inspector/property-control-renderer.tsx`
maps the existing field primitives (`text`, `textarea`, `url`, `number`,
`select`, `segmented`, `toggle`, `datetime`, `color`, `unit`, `spacing` and
`asset`) to controls. Complex properties use the registered custom editor
extension point in `custom-property-editors.tsx`.

The Inspector reads definitions and values, then dispatches a semantic property
update. It does not call GrapesJS model APIs. `component-editor-bindings.ts`
validates the finite property vocabulary and maps it to `set-property`; the
command executor remains the only mutation boundary. Form editing is now a
custom `form` property editor and list editing is a custom `list` property
editor. Existing component-specific snapshot fields remain only as a
compatibility bridge for older shell/debug consumers.

### PagePayload V4

`PagePayloadV4Schema` and `PageNodeV4` add:

- `heading`: plain text plus level 1–6;
- `link`: plain text, safe href and `_self`/`_blank` target;
- `divider`: an empty semantic node;
- `list`: stable item IDs, plain item text and ordered/unordered state;
- `video`: safe workspace/direct source, optional image poster and explicit
  playback flags.

V1, V2 and V3 schemas were not widened or reinterpreted. The union
`PagePayloadSchema` accepts all four versions. The adapter preserves an
existing compatible version when no newer feature is present and deterministically
promotes a serialized tree to V4 when a V4 node exists. API form binding,
submission, integration delivery and analytics traversal now read the complete
payload union, so a V4 page containing a form remains operational.

### Core components and parity

The contracts registry, GrapesJS adapter, command property bindings and
production renderer all have mappings for Heading, Link, Divider, List and
Video. Lists use editor-only `<li>` preview descendants; those descendants are
validated and removed at the payload boundary. Video autoplay is forced to be
muted by the editor binding and rejected by the contract when unsafe. Text and
list items are plain text, links and media sources use the existing URL safety
rules, and no iframe, script or arbitrary HTML path was added.

Style capabilities remain explicit in `PAGE_COMPONENT_STYLE_CAPABILITIES` and
`styleSchemaFor()`. Heading and Link expose typography/appearance, Divider
exposes sizing/spacing/border/opacity, List exposes typography/sizing/spacing,
and Video exposes sizing/spacing/border/opacity.

### Presets and insertion

`builder/block-presets.ts` contains the six starter presets: Blank Section,
Centered Section, Vertical Stack, Two Columns, Hero and CTA. Presets create
fresh valid component trees; no `presetId` is persisted. Their styles use the
editor-facing Style Registry vocabulary and serialize as normal node styles.
Add-panel insertion, Add-panel drag, Quick Add and context placement share the
same insertable definition and command/placement validation path.

The Add surface keeps Add, Layers, Assets and Page Settings, with Layouts and
Elements tabs. Search includes component/preset labels, IDs and keywords.

## Files changed

The main implementation is in:

- `packages/contracts/src/index.ts`
- `packages/contracts/src/component-registry.ts`
- `apps/cms/builder/component-editor-bindings.ts`
- `apps/cms/builder/block-presets.ts`
- `apps/cms/builder/inspector/property-control-renderer.tsx`
- `apps/cms/builder/inspector/custom-property-editors.tsx`
- `apps/cms/builder/inspector/builder-inspector.tsx`
- `apps/cms/builder/builder-adapter.ts`
- `apps/cms/builder/editor-commands.ts`
- `apps/cms/builder/grapes-editor.tsx`
- `apps/cms/builder/builder-shell.tsx`
- `apps/cms/builder/canvas/quick-add-overlay.tsx`
- `apps/renderer/app/renderer.tsx`
- V4 traversal updates in the API domain services.

## Tests and verification

Added or expanded coverage for V4 schema compatibility, registry capabilities,
adapter round trips, property bindings, command-driven list updates, preset
factories, semantic renderer output and stable IDs. Existing Phase 14.2 tests
remain in place, including inline synchronization, responsive inheritance,
alignment, drag/reparent, duplicate/delete, undo/redo, save/reload and parity
coverage.

The local unit status after implementation is:

- Contracts: 30 passing;
- CMS: 64 passing;
- Renderer: 13 passing;
- API: 47 passing, 12 skipped integration tests.

The repository-wide quality gates pass:

- `pnpm format:check`;
- `pnpm lint`;
- `pnpm typecheck`;
- `pnpm test`;
- `pnpm build`.

The dedicated Phase 15 E2E file passes 2/2. The complete local Playwright run
passed 44/53; the compatibility rerun after the registry UI fixes passed the
Countdown, Form, auto-scroll, circular-drop and both pointer-drag scenarios
(6/6). The remaining known failures are recorded in the handoff.

## Known limitations and remaining debt

- List items are edited through the Inspector. Inline RTE for individual list
  items is intentionally deferred so editor-only descendants cannot become
  persisted arbitrary HTML.
- Video supports safe workspace/direct sources and image posters only; provider
  embeds such as YouTube/Vimeo are out of scope.
- Preset insertion is a sequence of normal component commands where a wrapper
  is needed. GrapesJS remains the sole UndoManager owner; multi-step grouping
  should be revisited if future UX requires one-click atomic history for every
  nested preset operation.
- The repository requires Node >=24, while this verification environment uses
  Node 22.19.0 and reports the existing pnpm engine warning.
- Full E2E still depends on the local Mongo/auth fixture and the known Phase
  14.2 renderer/dev-server environment debt; failures are separated from new
  component regressions in the handoff.

## Phase 16 readiness

**YES for the architecture gate.** A future Quote primitive needs a contract,
registry entry, adapter/binding/renderer mapping and tests, but does not need a
new component branch in `builder-shell.tsx` or a large new Inspector branch.
