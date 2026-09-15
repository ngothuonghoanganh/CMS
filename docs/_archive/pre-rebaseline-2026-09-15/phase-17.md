# Phase 17 — Site Globals, Global Header/Footer & Navigation Presentation

## Status

**PHASE 17 COMPLETE: YES** for the implemented site-global scope. This phase
builds on the Phase 16 registry, slot, style, adapter, Inspector and command
platform. It does not copy global chrome into individual page payloads.

## Architecture

`SiteGlobals` is a versioned site-level draft document with optional published
state. Each global document is a `SiteGlobalPayloadV1` with `documentKind` set
to `site-header` or `site-footer`; it reuses the V6 `PageNode` union, registry
relationships, slot cardinality and responsive style contracts.

The API exposes workspace/site-scoped `GET` and `PATCH` globals routes. Site
publish validates and snapshots the draft into `publishedGlobals`. The public
resolver reads only that published snapshot, while legacy sites without custom
globals receive the existing renderer fallback. Draft globals are never
exposed by public delivery.

## Global components

- `global-header` is a non-insertable global root with `brand`, `navigation` and
  `actions` slots. Position is finite (`static` or `sticky`).
- `global-footer` is a non-insertable global root with a `content` slot; footer
  presets compose brand, navigation and optional legal text.
- `navigation-view` has presentation-only props: canonical `main` or `footer`
  source, orientation, alignment and mobile behavior. It has no `links` prop
  and therefore cannot become a second navigation truth.
- `site-brand` references site metadata and supports controlled `logo`, `text`
  or `logo-text` display and a safe href. Site branding is stored on the Site
  record, not duplicated in every page.
- Optional site social links use validated outbound URLs and remain simple
  presentation data; no integration/auth semantics were added.

The Site Navigation domain remains the single source for menu items. Renderer
context resolves navigation once and passes it to every `NavigationView`.
Nested items, active route matching and `aria-current="page"` are rendered
from that canonical data.

## Builder workflow

The existing BuilderShell now switches isolated documents through `Page`,
`Global Header` and `Global Footer`. Each context has its own GrapesJS live
document, selection and history lifecycle. Page mode shows locked global
previews with Edit affordances; global mode shows editable global content while
the surrounding chrome remains preview-only.

The palette is filtered by registry-declared `documentKinds`, global roots stay
out of the Add panel, and global presets apply their registry-declared
`replace-root-children` mode to the existing semantic root. They never append a
second `global-header`/`global-footer` node:

- Brand · Menu · CTA
- Brand · Menu
- Footer Brand · Menu
- Footer Brand · Menu · Legal

Saving a page creates a page draft version. Saving a header/footer updates the
scoped site-global draft. Inspector and structural operations remain the shared
generic Phase 16 paths.

Every insertion and duplicate crosses the shared builder identity service
before it reaches GrapesJS. The service reserves fresh IDs recursively, keeps
the editor root sentinel as `root`, remaps supported internal references, and
rejects duplicate IDs at the serialization boundary. A global preset replaces
only the existing region's children, is one command/Undo boundary, and asks for
confirmation when that region is non-empty.

## Renderer and responsive behavior

`navigation-view-runtime.tsx` renders accessible links, nested items, active
state and mobile behavior. Collapse mode provides a labelled button with
`aria-expanded` and `aria-controls`; Escape closes the panel and returns focus
to the toggle. Horizontal, vertical, wrap, stack and alignment behavior use
finite registry/CSS capabilities. Header/footer/navigation/brand component
parts reuse V6 scoped responsive styles; no arbitrary CSS, HTML or script
surface was introduced.

Public page rendering now composes:

```text
published site globals
+ published page payload
+ resolved site navigation
+ site branding metadata
```

The old default navigation/header path remains the fallback for sites without a
custom global document.

## Verification

Validated with Node `v24.11.0` and pnpm `10.15.0`:

- Contracts unit tests — PASS: 36/36
- CMS unit tests — PASS: 76/76
- Renderer unit tests — PASS: 16/16
- API unit tests — PASS: 47 passed / 12 skipped
- format, lint, typecheck and build — PASS
- Focused Phase15 + Phase16 + Phase17 Playwright gate — PASS: 7/7
- Phase17 site-global E2E — PASS: scoped document switching, presets,
  draft persistence, homepage/site publish, published snapshot and public
  header rendering

The full Playwright suite ran 58 tests: 56 passed and the same two unrelated
baseline failures remained—tenant extension disable returned 409 instead of the
test's expected 201, and builder/renderer desktop screenshot parity measured 65
mismatches against a threshold of 8. No Phase17-focused test failed.

## Out of scope / follow-up

Mega menus, dropdown redesign, local navbar components, reusable symbols,
theme libraries, arbitrary HTML/JS/iframes, dynamic data binding and a full
navigation-management redesign remain out of scope. Dedicated Phase14 E2E
files are absent; existing broad suites cover those compatibility paths.

**PHASE 18 READY: YES**, subject to release-owner disposition of the two
pre-existing full-suite failures.
