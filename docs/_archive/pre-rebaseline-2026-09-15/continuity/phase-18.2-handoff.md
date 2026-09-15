# Phase 18.2 Handoff

## Current state

Phase 18.2 closes the two Phase 18.1 release blockers:

1. Builder/Review/Published parity now passes with exact DOM/computed-style and
   geometry assertions and zero final screenshot mismatches across desktop,
   tablet, and mobile.
2. Extension disable behavior is isolated and explicit: unused and draft-only
   usage return 201; published usage returns 409 with
   `EXTENSION_PUBLISHED_DEPENDENCY`.

The current branch is `main` at
`a81c28bc5cf5ed356ace27246c343f59b68c1120`. No commit was created by the
task. The working tree contains the Phase 18.2 implementation and preserves
pre-existing user changes in the builder and CMS E2E files.

## Architecture decisions

- The Builder remains the authoring truth and persisted PagePayload remains the
  data truth.
- Navigation labels, site brand, Accordion controls, Tabs controls, and global
  child part markup are editor-only semantic projections. They carry explicit
  markers and never enter canonical serialization or persisted identity lookup.
- `applyEditorPartViewportStyles` is the Canvas presentation boundary. It reads
  persisted part styles, resolves base/tablet/mobile cascade and design tokens,
  locates registry-defined semantic parts, and paints the live DOM without
  mutating the payload for viewport changes.
- Renderer global child roots receive base part styles directly; responsive
  rules continue through the shared registry-driven renderer path.
- Legacy V5 compound props are promoted with the existing safe defaults when a
  style-only edit requires V6 validation. The promotion happens at Save, not as
  a background migration.
- Page deletion cascades page-extension instances after page-delete guards have
  passed, so published dependency safety remains enforced while stale bindings
  cannot poison later isolated tests.

## Validation

Using Node `v24.11.0` and pnpm `10.15.0`:

- `corepack pnpm format:check` — pass.
- `corepack pnpm lint` — pass.
- `corepack pnpm typecheck` — pass.
- `corepack pnpm test` — pass: contracts 39, CMS 101, renderer 19, API 48;
  12 existing API integration tests skipped by the environment gate.
- `corepack pnpm build` — pass for all five workspace packages.
- Targeted release E2E — 12 passed.
- Phase 18.2 part-style E2E — passed: immediate Trigger paint, responsive
  desktop/tablet/mobile cascade, viewport non-mutation, Save, and reload.
- Full Playwright — 66 passed, 0 failed, one worker.

## Parity evidence

The prior 55-pixel desktop mismatch was traced before changing assertions.
Payload, hydration, CSS declarations, computed styles, geometry, browser
defaults, and iframe/top-level behavior were equal. The remaining difference
was a deterministic capture-edge antialias fringe. The parity comparator now
records pairwise diff images, bounding box, coordinates, affected node IDs, and
normalized screenshots when a mismatch exists. It retains the existing eight
pixel mismatch threshold and does not skip the test.

## Files to know

- `apps/cms/builder/builder-adapter.ts`: projection serialization boundary and
  live component-part presentation engine.
- `apps/cms/builder/grapes-editor.tsx`: Canvas lifecycle application and
  projection context wiring.
- `apps/cms/builder/builder-shell.tsx`: site metadata/navigation context for
  the Canvas.
- `apps/cms/builder/builder-node-identity.ts`: duplicate normalization report.
- `apps/renderer/app/renderer.tsx`: public base styles for global child parts.
- `apps/api/src/domain/page.service.ts`: page-scoped extension-instance
  cascade.
- `tests/e2e/builder-renderer-parity.spec.ts`: parity diagnostics and gate.
- `tests/e2e/api.spec.ts`: isolated extension disable contract.
- `tests/e2e/phase-16-compound-components.spec.ts`: live part-style browser
  regression.

## Known environment note

The repository `.nvmrc` says `24.19.0`, but the available local release used
for the final gate was `24.11.0`. It is Node 24+ and passed the complete gate.
Pin CI/developer shells to `.nvmrc` when `24.19.0` is installed.

## Next task boundary

Phase 18.2 is complete. The next task may start Phase 19, separately, for CMS
Collections and Dynamic Data Binding. Do not mix Phase 19 implementation into
this worktree handoff.

Decision: `SAFE TO START PHASE19`.
