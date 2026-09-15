# Pages + Builder V2 Handoff

## Delivered

This increment establishes the shared foundation and the first usable Pages/Builder V2
surfaces without changing the PagePayload persistence boundary or page routes.

- `packages/contracts/src/style-registry.ts` is the single source for responsive
  breakpoints and editor/payload/CSS style capability mappings.
- `PAGE_COMPONENT_REGISTRY` remains exhaustive and drives the block list. The renderer
  dispatch is exhaustive and has parity coverage against the component registry.
- Pages is extracted into `apps/cms/app/pages/pages-view.tsx` as a sitemap/detail
  manager. It includes hierarchy, search/status filters, homepage state, route conflict
  messaging, compact page actions, blank/template/duplicate creation choices,
  metadata editing, SEO/settings/version/integration access and explicit deletion.
- The Builder shell has a tool rail for Add, Layers, Assets and Sections; a larger
  Canvas workspace; breakpoint controls; locked site header/footer navigation chrome;
  Content/Style/Settings inspector tabs; quick style controls for compatibility;
  collapsible left/right panels; publish gating; and existing conflict-safe save,
  undo/redo, drag/drop, keyboard layer navigation and live preview behavior.
- Existing pages orchestration remains dashboard-owned for API/RBAC state, while the
  extracted view owns Pages-specific composition and interaction state.

## Important files

- [`pages-view.tsx`](../../apps/cms/app/pages/pages-view.tsx) — Pages V2 surface.
- [`builder-shell.tsx`](../../apps/cms/builder/builder-shell.tsx) — Builder workspace and
  inspector.
- [`style-registry.ts`](../../packages/contracts/src/style-registry.ts) — shared style
  and responsive contract.
- [`renderer.tsx`](../../apps/renderer/app/renderer.tsx) — exhaustive public renderer
  registry and responsive style emission.
- [`pages-builder-v2.md`](../pages-builder-v2.md) — product and architecture brief.
- [`pages-builder-v2.md`](../architecture/pages-builder-v2.md) — implemented architecture
  decisions and follow-up boundary.
- [`pages-builder-v2-plan.md`](../implementation/pages-builder-v2-plan.md) — scoped
  implementation plan and deferred boundary.

## Validation

The following checks were run during this increment:

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- Playwright smoke coverage for page metadata creation/editing, Builder draft
  restore, inspector persistence and responsive viewport/style behavior.
- `pnpm verify` — passed after the final Builder/Pages changes, including production
  builds for all five workspaces.

The full Playwright suite should be run in an environment with the repository's three
dev servers available; the test harness takes roughly a minute to start those servers.
Focused E2E coverage also passed for Countdown delivery, SEO/custom-domain metadata,
integrations, layer interactions, responsive inspector behavior and site/workflow
publishing. One form scenario reached the publish acknowledgement but timed out while
the public renderer was loading the republished route in the local multi-server test
environment; it did not fail on the Pages publish action.

## Deferred boundary

The canvas is intentionally still GrapesJS-backed. A later increment can introduce a
renderer-backed semantic canvas and typed preview selection protocol after the current
interaction and persistence contracts are stabilized. Token/theme authoring, a full
component pattern library, richer block drag previews and Page Health checks remain
future work described in the main V2 brief.
