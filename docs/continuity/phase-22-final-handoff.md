# Phase 22 Final Handoff

## State

Phase 22 Open Composition is implemented in the working tree. The current
repository HEAD remains the pre-Phase-22 commit; no commit or remote operation
was performed by this work.

## Main files

- `packages/contracts/src/open-composition.ts`: V8 contract, registry,
  behaviors, migration, and recipe registry.
- `apps/cms/builder/builder-adapter.ts`: V8 GrapesJS hydration and round-trip.
- `apps/cms/builder/editor-commands.ts`: lazy legacy promotion and behavior
  lifecycle for insert, duplicate, and delete.
- `apps/cms/builder/builder-node-identity.ts`: Open behavior reference remapping.
- `apps/cms/builder/block-presets.ts`: Contact Form recipe catalog entry.
- `apps/renderer/app/open-composition-renderer.tsx`: V8 HTML/runtime renderer.
- `apps/api/src/domain/open-composition-form.ts`: stable API form projection.
- `apps/cms/app/ui/fields.tsx`: stable Inspector accessible names for required
  controls.

## Verification

`pnpm typecheck`, lint, and the deterministic full test matrix pass: contracts
79 tests, API 92 passed plus 12 skipped, CMS 142 tests, and renderer 27 tests.
The targeted Builder browser matrix also passes all 11 tests across validation
UX, compound components, and stability. All changed files are formatted and
`git diff --check` passes.

## Next safe step

Repeat the matrix under the repository's required Node >=24 runtime, then
exercise V7 hydration → V8 save → preview/publish and a public Contact Form
submission in staging. The current workspace runs Node 22, so package commands
emit the repository engine warning even though the checks pass.
