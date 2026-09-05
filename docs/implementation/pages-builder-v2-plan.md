# Pages + Builder V2 implementation plan

## Current architecture

- The domain remains `Workspace -> Site -> Page -> PageVersion -> PagePayload`.
- `GrapesJS` owns the live editable document during a builder session.
- `PagePayload` is the only persisted content contract; renderer and preview consume it.
- Pages state, metadata CRUD, selection, versions, SEO and publication orchestration live in
  `apps/cms/app/pages/pages-page.tsx` and `pages-view.tsx`.
- The dedicated builder route loads the current draft, adapts it to GrapesJS, saves immutable versions with optimistic conflict protection, and opens a renderer preview through `postMessage`.

## Current pain points

- Pages is still rendered as an inventory/list surface and its view plus orchestration remain in the dashboard monolith.
- Page actions are spread between rows, a drawer footer and the version-history panel; there is no sitemap/tree detail surface.
- Builder presents blocks, runtime extensions and layers in one fixed left panel.
- Style capability metadata is duplicated in contracts, the editor adapter and production renderer.
- Responsive media widths are hard-coded independently in GrapesJS and the renderer.
- Renderer dispatch is typed as partial, so a new core node can be missed until runtime.
- The preview bridge validates its existing message but has no typed node interaction protocol yet.

## Files affected

- `packages/contracts/src/style-registry.ts`, `component-registry.ts`, `index.ts`
- `apps/cms/builder/builder-adapter.ts`, `grapes-editor.tsx`, `builder-shell.tsx`
- `apps/renderer/app/renderer.tsx`, preview bridge files
- `apps/cms/app/pages/*`, `apps/cms/app/cms-shell.tsx`, `globals.css`
- `docs/pages-builder-v2.md`, `docs/architecture/pages-builder-v2.md` and
  `docs/continuity/pages-builder-v2-handoff.md`

## B0 plan

1. Establish one style capability and breakpoint registry in contracts.
2. Expand only contract-safe style properties needed by semantic layout controls.
3. Make adapter and renderer consume the same definitions and breakpoint values.
4. Make the core renderer registry exhaustive and add registry/round-trip parity tests.
5. Add a validated, origin-safe preview bridge message foundation for future renderer-backed canvas work.

## B1 plan

1. Extract Pages into a client `PagesView` module with a sitemap tree derived from canonical paths.
2. Keep page selection and API ownership in the Pages module while reducing Pages-specific
   markup in shared surfaces.
3. Add compact selected-page detail, action menu, homepage marker, route/status warnings and updated metadata.
4. Replace the metadata-only create drawer with a blank/template/duplicate start flow while preserving existing API endpoints.
5. Keep settings, SEO, versions and form integrations in focused secondary surfaces.

## B2 plan

1. Add an activity rail and one active left panel for Add, Layers, Assets and Sections.
2. Keep GrapesJS as the live model and preserve existing drag, history, save and preview behavior.
3. Add local scrolling/collapse behavior and responsive panel overlays without changing routes or payload semantics.
4. Split Inspector into Content, Style and Settings tabs, with existing controls routed through shared metadata.

## Risks

- Existing PagePayload versions and extension behavior must remain byte/semantic compatible.
- API version creation is immutable, so no naive autosave will be introduced in this pass.
- GrapesJS device media behavior must be aligned carefully with production CSS breakpoints.
- Pages extraction touches a large client component; changes must preserve permissions and request race protection.

## Current status

- B0 is implemented: shared style/breakpoint metadata, exhaustive renderer dispatch,
  adapter round-trip coverage and renderer registry parity coverage are in place.
- B1 is implemented: Pages is a sitemap/detail manager with create-source choices,
  compact actions, metadata drawer, SEO/settings/version/integration surfaces and
  explicit delete confirmation.
- B2 is implemented: the Builder has a tool rail, active Add/Layers/Assets/Sections
  panels, global navigation chrome, breakpoint controls, inspector tabs and
  collapsible side panels.
- Existing B3 interaction primitives remain active through the GrapesJS live model:
  drag/drop, layer movement, keyboard navigation, undo/redo, conflict-aware immutable
  saves and origin-checked live preview.
- B4 semantic canvas replacement, token/theme infrastructure and full renderer-backed
  selection synchronization are intentionally deferred. The current canvas remains
  GrapesJS-backed so the existing editing and persistence behavior stays safe.
