# Builder/Renderer Parity Handoff

## Delivered

- A contracts-owned shared page runtime baseline and form class names.
- Builder iframe reset/layout/form alignment without importing CMS chrome.
- Correct base/tablet/mobile cascade and breakpoint-delta capture.
- Form, countdown fallback, and unavailable extension preview alignment.
- Complete draft preview renderer context and non-displacing preview banner.
- Registry-based React style conversion, quoted font support, numeric opacity.
- Deterministic SVG fixture and strict three-surface Playwright parity coverage.

## Primary files

- `packages/contracts/src/page-runtime.ts`
- `packages/contracts/src/style-registry.ts`
- `apps/cms/builder/builder-adapter.ts`
- `apps/cms/builder/grapes-editor.tsx`
- `apps/renderer/app/renderer.tsx`
- `apps/renderer/app/form-renderer.tsx`
- `apps/renderer/app/preview/[pageId]/preview-bridge.tsx`
- `tests/e2e/builder-renderer-parity.spec.ts`

## Validation commands

```bash
pnpm --filter @payload/contracts build
pnpm --filter @payload/renderer test
pnpm --filter @payload/cms test
pnpm exec playwright test tests/e2e/builder-renderer-parity.spec.ts
pnpm verify
```

Run the focused test before changing the style registry, renderer node mapping,
GrapesJS canvas CSS, forms, breakpoints, or the preview bridge. It uses the
configured local API/CMS/renderer web-server setup and development credentials.

## Future work

Keep PagePayload runtime rules in `page-runtime.ts`; do not add editor styles to
that file. Add style properties to the registry first and update both renderers
plus the fixture when visible behavior changes. Add frozen-clock or deterministic
data-provider coverage before asserting screenshot parity for live extensions.
