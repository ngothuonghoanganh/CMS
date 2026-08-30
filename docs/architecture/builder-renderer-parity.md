# Builder, Review, and Published Renderer Parity

## Goal

One `PagePayload` must render with matching document geometry and computed page
styles in the Builder iframe, authenticated draft review, and public published
page. The Builder remains authoring-only; the renderer remains the production
rendering authority.

## Scope

The contract covers every registered PagePayload node, the style registry,
responsive breakpoints, forms, supported images, and deterministic extension
fallbacks. CMS toolbars, selection outlines, drag indicators, and preview
banner are product chrome, not page content.

## Shared runtime baseline

`packages/contracts/src/page-runtime.ts` supplies both surfaces with
`PAGE_RUNTIME_BASELINE_CSS` and `PAGE_RUNTIME_CLASS_NAMES`. It owns the reset,
root/section/container sizing, text/image defaults, and form appearance. The
renderer injects the baseline from its root layout and the Builder injects the
same stylesheet into the GrapesJS iframe. It contains no CMS chrome; the
Builder's remaining canvas CSS is editor interaction-only.

## Rendering and responsive contract

`PagePayload` is the portable persisted document. `renderer.tsx` maps it to
production React markup and Builder adapter definitions map it to GrapesJS.
`PAGE_STYLE_PROPERTY_DEFINITIONS` is the only registry for authored properties;
the renderer uses its shared React-property conversion rather than a handwritten
property map.

The responsive cascade is `base -> tablet (max-width: 992px) -> mobile
(max-width: 480px)`. The Builder resolves that cascade before applying a device
viewport and stores only the active breakpoint delta. The renderer emits base
declarations and matching media rules, so tablet styles inherit into mobile
until mobile overrides them.

## Preview and publication

Draft review receives the saved document through the existing origin-checked
preview bridge. It now receives the site, page, tenant, and extension context
needed by production forms, preventing a valid review form from appearing
disabled. The preview banner is fixed overlay chrome and cannot shift the page.
Published routes resolve the normal published snapshot; neither renderer route
loads Builder markup, styles, or runtime.

## Determinism and regression harness

The fixture uses a local immutable SVG, fixed labels, static countdown output,
and unavailable-extension fallback. Enabled time/data-driven extensions are
excluded from strict screenshot comparison unless their data source is frozen.

`tests/e2e/builder-renderer-parity.spec.ts` creates a real site/page, saves and
publishes a comprehensive payload, verifies draft/review/public payload equality,
and compares node IDs/types, rectangles (within one CSS pixel), and
registry-derived computed styles at desktop, tablet, and mobile. It compares
all three screenshot pairs (Builder ↔ Review, Review ↔ Published, and Builder ↔
Published) after a one-pixel edge crop and conservative RGB canonicalization;
the allowed residual is at most eight pixels per pair. The fixed preview banner
is hidden only for isolated page-root screenshots.
Playwright trace, video, and compared images remain on failure.
