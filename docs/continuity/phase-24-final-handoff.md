# Phase 24 Final Handoff

## Release identity

- Repository: `ngothuonghoanganh/CMS`
- Starting main SHA: `64d22e9 docs: record phase 23.3 hardening closure`
- Feature branch: `ao/cms-7/phase-24-native-open-composition`
- Feature implementation SHA: `25a663b feat(builder): add native open composition authoring`
- Feature ending SHA: pending documentation commit
- Local main merge SHA: pending local merge
- Remote push: **NOT PERFORMED**
- Node validation: `v24.19.0` (repository `.nvmrc` / engine target)
- pnpm: `10.15.0`

## Delivered areas

- Native V8 List authoring with stable item records, add/edit/remove/reorder,
  minimum-one protection, Bullets/Numbers, and ordered `<ul>`/`<ol>` parity.
- Native V8 FAQ/Disclosure authoring with aggregate question commands,
  managed trigger/panel ownership, single/multiple-open defaults, semantic
  Layers/Inspector controls, accessible runtime behavior, and one-Undo actions.
- Native V8 Tabs authoring with atomic trigger/panel pairs, relation remapping,
  aggregate commands, semantic Layers/Inspector controls, ARIA, and keyboard
  navigation.
- Gallery presets implemented as normal Grid + Image recipes, while legacy
  Gallery compatibility remains available.
- Explicit legacy promotion mappings, V8 boundary repair, shared ownership
  checks, safe bounded IDs, and renderer parity through public publishing.
- Dedicated release journey at
  `tests/e2e/phase-24-native-open-composition.spec.ts`.

## Architectural decisions

GrapesJS is still the authoritative mutable editor model and its UndoManager is
the only history implementation. V8 is the persisted forward contract; V1–V7
remain immutable legacy contracts. The implementation does not introduce a
second editor tree, a second renderer, or a general state engine.

The canonical ownership table is maintained in `docs/phase-24.md`. In
particular, List `items`/`ordered`, disclosure semantic item shells, Tabs
trigger/panel behavior references, and Grid/Image recipe primitives each have a
single source of truth. Aggregate compound actions cross the existing command
boundary and group all internal GrapesJS mutations into one Undo entry.

Native palette IDs are allowed to differ from persisted node types where the
legacy registry has an overlapping `list` or `tabs` entry. This preserves V1–V7
authoring and rendering while native insertion persists V8 `list` and `tabs`
nodes. Normal user controls remain semantic and do not require internal IDs.

## Migration decisions

Legacy promotion is explicit and deterministic. It does not mutate the source
payload, preserves content, order, and supported styles, remaps node/behavior
references, and uses a safe compatibility fallback if a legacy case is not
lossless. Canonicalization remains a repair/normalization boundary only; it
does not globally migrate compatibility nodes during ordinary load/save.

The existing V1–V7 renderer paths remain in place and their legacy browser
coverage continues to pass. New Gallery insertion deliberately does not add a
Gallery-specific V8 renderer path.

## Verification record

All static, unit, build, and focused release checks below were run with Node
`v24.19.0` after the final source hardening change.

- `pnpm format:check`: passed.
- `pnpm lint`: passed (4 Turbo tasks).
- `pnpm typecheck`: passed (5 Turbo tasks).
- `pnpm check:cms-design-system`: passed.
- Focused Vitest contracts/CMS/renderer suites: `5 files, 132 tests passed`.
- `pnpm test`: passed — contracts `98`, CMS `169`, renderer `31`, API `98`;
  all 5 Turbo tasks succeeded.
- Fresh production build: `pnpm exec turbo build --force` passed, `5/5`
  tasks with no cache hits. The canonical `pnpm build` also passed earlier in
  the same validation cycle.
- Focused Phase 24 Playwright journey: `1 passed`.
- Focused legacy regression reruns: Phase 16 Tabs `1 passed`; Phase 23
  responsive Open Composition `1 passed`.
- Full Playwright release run: `114 passed, 0 failed` on the feature worktree
  during the release validation cycle.
- `git diff --check`: passed.

Two later full-suite confirmation attempts were not used to downgrade the
product result: one reused a stateful database and reported an intermittent
publishing stale-page failure (`113 passed, 1 failed`), and a fresh-database
attempt later accumulated unrelated auth/route/teardown timeouts under the
local host load. The Phase 24 journey and each observed legacy failure were
rerun independently and passed. Those harness/environment observations are
retained here rather than reported as green full-suite runs.

The unit baseline includes existing API integration skips (12 tests across 5
API files in the current repository test configuration). They are not claimed
as product passes and are not Phase 24 skips.

## Known limitations and follow-up

- Malformed persisted V8 data is repaired at canonicalization boundaries;
  compatibility-to-forward conversion still requires the explicit migration
  seam by design.
- The advanced Inspector surface may retain diagnostic stable-ID metadata for
  designers, but normal List/FAQ/Tabs authoring rows use user-facing labels.
- No new Gallery semantic node is created for content authored after Phase 24;
  legacy Gallery data remains on compatibility paths.

No known P0 or P1 issue is accepted for closure. P2 items may remain only when
they do not affect the no-code journey, data integrity, semantic validity,
accessibility, or Builder/Renderer parity; any such item must be listed here.

## Final closure state

- P0: `0`
- P1: `0`
- Feature working tree: pending final documentation commit
- Local `main`: pending `--no-ff` merge and post-merge verification
- Final status: pending local merge
