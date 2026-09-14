# Builder Managed / Design System Unification — Phase 24

## Repository state

- Starting commit SHA: `bbae4a3f30741c10067485055ea96b68579d5e32`
- Final commit SHA: not applicable; no commit was created.
- Working branch: `ao/cms-8/root`
- Runtime used for validation: Node `v24.19.0`, pnpm `10.15.0`
- MongoDB E2E substrate: `cms-8-phase24-mongodb`, exposed on `127.0.0.1:27018`, labeled for this AO session.

## Confirmed root causes

1. The Layers badge was derived from `semanticOwner`, which describes structural control by another semantic node, not whether the row represents a persisted Builder node. Ordinary nodes therefore lacked Managed state, while semantic ownership was carrying two unrelated meanings.
2. Design System resolution was centered on the legacy Page Component registry. Open Composition nodes were only partially covered, and the Open renderer and Builder projection contained visual fallbacks such as primitive gaps and radii. Builder part styling also treated local `partsStyle` as a complete source instead of an override.
3. Builder and renderer had separate merge paths. Initial Builder projection could be created before the site-effective Design System was available, and promotion did not consistently carry the effective system into the editor projection. This made visual drift possible even when persisted payloads were unchanged.
4. Gallery was exposed as three catalog presets whose recipe column count also determined the initial image count. The Grid inspector used a finite segmented control, so the product model did not represent independent layout and content.
5. Older complete platform-default Design System snapshots could be accepted by the sparse override boundary and mask a newer workspace system. A compatibility-aware default snapshot check is now covered by contracts tests.

## Architecture before

```text
Layers Managed badge <- semanticOwner
Legacy registry resolver + Open-specific fallbacks
Builder style merge != renderer style merge
Gallery preset columns -> recipe image count
```

## Architecture after

```text
Persisted node metadata -> Builder Managed
Semantic ownership      -> structural restrictions only

Design Style Target registry
  -> shared effective resolver
  -> Builder Canvas / Review / Published renderer

Design System
  < semantic recipe / part
  < local base override
  < local responsive override

Gallery catalog entry -> Grid composition -> independent Image children
```

## Managed state and semantic ownership

- Added `isBuilderManagedNode`, derived from persisted Payload node identity/type and excluding editor-only projections.
- Canvas state marks each persisted node `managed: true`; this is derived state rather than a new persisted boolean.
- Layers now displays Managed for ordinary and semantic-owned persisted nodes alike.
- `semanticOwner` remains an explicit relationship used for non-structural/aggregate restrictions. It is not used to decide Managed state.
- Direct interaction tests cover ordinary nodes, semantic Form children, projection nodes, and the existing structural restrictions.

## Design System resolution architecture

- Added the shared `DesignStyleTarget` registry and resolver in `packages/contracts`.
- Targets cover legacy variants plus Open Composition primitives and semantic parts, including Form field/label/input/submit, disclosure, Tabs, active Tabs, Stack, Row, Grid, and Card.
- Directly authored Open primitives Icon, Divider, List, Video, and Quote now also have explicit own-type Design System recipes; they do not fall through to renderer-owned visual defaults.
- Added shared responsive and effective appearance functions. They resolve Design System base/responsive values first, then local base and current-viewport overrides.
- Empty/reset local blocks are removed from the payload, so the inherited Design System value becomes effective again without materializing it into the document.
- Layout primitives retain only structural invariants in editor/renderer adapters: for example Stack flex-column, Row flex, and Grid display-grid. Visual gap, alignment, surfaces, borders, radius, typography, and shadows are Design System recipes.
- Known pre-Open-Composition full default snapshots are recognized as transparent compatibility snapshots. Customized full snapshots still normalize to sparse site overrides.

## Open Composition changes

- Open nodes now hydrate with the effective Design System on the initial Builder projection and on live Design System changes.
- Open node and semantic-part styling uses the same resolver as legacy nodes.
- Form submit behavior is represented as a semantic submit part even when the button is nested below a layout container.
- Open responsive style metadata is validated as `CompositionStyle`; local resets remove empty responsive metadata.
- Grid columns accept a validated positive integer and canonicalize it to `repeat(N, minmax(0, 1fr))` with a safe 1–999 authoring range. Raw CSS is rejected.
- Legacy-to-V8 promotion retains IDs, authored local styles, content, and semantic relationships and does not copy Design System values into migrated nodes.

## Builder / Review / Published parity

- Builder viewport painting, Inspector inherited values, Open projection, legacy renderer, Open renderer, responsive CSS, and semantic part CSS now consume the shared effective resolver.
- Initial Builder loading resolves the site-effective Design System before exposing the document to GrapesJS.
- Added a V8 parity fixture with custom typography, surfaces, spacing, Grid, Card, and responsive Form Input values. It compares Builder, review, and published computed styles at desktop, tablet, and mobile.
- Existing legacy parity coverage remains in place.

## Legacy → V8 promotion findings

- Promotion is structural and sparse. It preserves existing node IDs and local styles and uses the current Design System only for projection-time painting.
- Phase 24 E2E captures an existing section’s computed background, text color, and padding before inserting a native composition, then verifies those values after promotion.
- Contact Form insertion inherits the custom Design System, including form surface, input radius, and submit styling, without adding those values to local node style.
- Gallery insertion follows the same promotion path.

## Gallery changes

- Add Blocks now exposes exactly one public Gallery entry.
- Historical recipe IDs `gallery-2-columns`, `gallery-3-columns`, and `gallery-4-columns` remain resolvable for compatibility but are no longer catalog entries.
- New Gallery is a normal Grid + Image composition with six representative initial images and three initial columns.
- Grid column authoring is numeric and canonicalized safely; there are no 5/6/8/12 presets.
- Catalog preview columns are numeric presentation data with a thumbnail-only safety clamp; the preview type no longer encodes a `2 | 3` authoring union.
- Column changes do not add, remove, recreate, or re-identify Image children.
- Image add/remove/reorder operates through normal structural editing and leaves the configured column style unchanged.
- Legacy `gallery` payloads remain supported by the legacy registry and renderer. The legacy renderer’s compatibility fallback was intentionally left in place for old payloads; new Gallery documents use the Open Grid composition.

## Backward compatibility decisions

- V1–V7 payload schemas and migration behavior were not rewritten.
- Legacy Page Components and semantic compound ownership rules remain supported.
- Old Gallery node payloads and old recipe identifiers remain renderable/resolvable.
- No broad document migration or Design System value materialization was added.
- Existing node IDs are retained through promotion and normal authoring operations.

## Meaningful files changed

- `packages/contracts/src/index.ts` — shared targets, cascade, responsive resolution, defaults, and legacy snapshot compatibility.
- `packages/contracts/src/open-composition.ts` — numeric Grid authoring and composition Gallery recipes.
- `packages/contracts/src/component-registry.ts` — legacy Gallery retained but removed from insertion catalog exposure.
- `apps/cms/builder/builder-block/builder-adapter.ts` — Open metadata, shared style painting, semantic parts, responsive/reset handling, and safe Grid normalization.
- `apps/cms/builder/builder-block/block-presets.ts` — one Gallery catalog item.
- `apps/cms/builder/builder-block/builder-preview-model.ts` and `builder-block-catalog.tsx` — representative preview behavior without Gallery authoring unions.
- `apps/cms/builder/builder-block/builder-structural-domain.ts`, `editor-commands.ts`, `builder-interaction.ts` — Open/legacy discrimination, promotion, structural rules, and Managed derivation.
- `apps/cms/builder/grapes-editor.tsx`, `builder-shell.tsx`, `inspector/builder-inspector.tsx`, `inspector/inspector-value.ts` — initial/live Design System projection, Layers state, inherited Inspector values, parts, and reset controls.
- `apps/renderer/app/renderer.tsx` and `open-composition-renderer.tsx` — shared effective styling and responsive/part parity.
- `tests/e2e/phase-24-native-open-composition.spec.ts` — real Phase 24 Builder journey.
- `tests/e2e/builder-renderer-parity.spec.ts` — V8 and legacy parity coverage.
- `tests/e2e/phase-16-compound-components.spec.ts` — composition-based Gallery compatibility coverage.
- Contract, adapter, interaction, preset, and renderer specs covering the new invariants.

## Tests added/updated

- Managed state is independent from semantic ownership and excludes projections.
- Design Style Target mapping, responsive inheritance, local override/reset, and legacy full-default compatibility.
- Open Form semantic part projection, submit behavior, and responsive input reset.
- Numeric Grid/Gallery columns and raw CSS rejection.
- Single Gallery catalog entry and composition recipe behavior.
- Legacy and V8 Builder/renderer computed-style parity.
- Gallery image/content editing independence.

## Playwright journey and artifacts

Executed the real application journey with MongoDB and Playwright:

- `tests/e2e/phase-24-native-open-composition.spec.ts` — **1 passed**. Covers custom Design System, Layers Managed state, legacy→V8 promotion, Contact Form parts, responsive reset, FAQ/Tabs, one Gallery entry, columns 1/2/4/5/8/12, image independence, save/reload, review, publish, and public rendering.
- `tests/e2e/builder-renderer-parity.spec.ts` — **2 passed**. Covers legacy parity and V8 Builder/review/published parity at desktop/tablet/mobile.
- `tests/e2e/phase-16-compound-components.spec.ts` — **5 passed**. Covers compound compatibility and composition-based Gallery behavior.

Successful runs did not retain a final screenshot artifact; computed DOM/style assertions were the deterministic evidence. A transient diagnostic screenshot/trace was produced by an earlier compatibility assertion while the test still expected the removed Gallery-specific add button, then the test was aligned with the current generic Grid structure controls and the full file passed.

## Exact validation commands and results

All commands below used Node `v24.19.0` through the task-specific PATH and pnpm `10.15.0`.

| Command                                                                                                                                                                     | Result                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `corepack pnpm install --frozen-lockfile`                                                                                                                                   | PASS                                                                   |
| `corepack pnpm --filter @payload/contracts test -- src/index.spec.ts src/component-registry.spec.ts src/open-composition.spec.ts`                                           | PASS — 6 files, 102 tests                                              |
| `corepack pnpm --filter @payload/cms test -- builder/builder-block/builder-adapter.spec.ts builder/builder-block/block-presets.spec.ts builder/builder-interaction.spec.ts` | PASS — 24 files, 173 tests                                             |
| `corepack pnpm --filter @payload/renderer test -- app/renderer.spec.tsx`                                                                                                    | PASS — 2 files, 31 tests                                               |
| `corepack pnpm --filter @payload/contracts build`                                                                                                                           | PASS                                                                   |
| `corepack pnpm --filter @payload/api typecheck`                                                                                                                             | PASS                                                                   |
| `corepack pnpm --filter @payload/cms typecheck`                                                                                                                             | PASS                                                                   |
| `corepack pnpm --filter @payload/renderer typecheck`                                                                                                                        | PASS                                                                   |
| `corepack pnpm --filter @payload/contracts lint`                                                                                                                            | PASS                                                                   |
| `corepack pnpm --filter @payload/cms lint`                                                                                                                                  | PASS                                                                   |
| `corepack pnpm --filter @payload/renderer lint`                                                                                                                             | PASS                                                                   |
| `corepack pnpm check:cms-design-system`                                                                                                                                     | PASS                                                                   |
| `corepack pnpm format:check`                                                                                                                                                | PASS                                                                   |
| `corepack pnpm lint`                                                                                                                                                        | PASS — 4 package tasks                                                 |
| `corepack pnpm typecheck`                                                                                                                                                   | PASS — 5 package tasks                                                 |
| `corepack pnpm test`                                                                                                                                                        | PASS — contracts 102, CMS 173, renderer 31, API 98 passed / 12 skipped |
| `corepack pnpm build`                                                                                                                                                       | PASS — 5 package tasks                                                 |
| `corepack pnpm verify`                                                                                                                                                      | PASS — all aggregate gates                                             |
| `corepack pnpm exec playwright test tests/e2e/phase-24-native-open-composition.spec.ts --workers=1`                                                                         | PASS — 1 test                                                          |
| `corepack pnpm exec playwright test tests/e2e/builder-renderer-parity.spec.ts --workers=1`                                                                                  | PASS — 2 tests                                                         |
| `corepack pnpm exec playwright test tests/e2e/phase-16-compound-components.spec.ts --workers=1`                                                                             | PASS — 5 tests                                                         |
| `git diff --check`                                                                                                                                                          | PASS                                                                   |

Repository preparation also included `git status`, branch/SHA/log inspection, and `git fetch origin`. The requested `git fetch --ff-only origin` form was not supported by the installed Git client, so the non-destructive plain fetch was used successfully. No history rewrite, cleanup, commit, or push was performed.

## Known remaining risks

- The full unfiltered Playwright corpus (`pnpm test:e2e:full`) was not run. The Phase 24, parity, and directly affected Phase 16 suites were run against the real application.
- The compatibility-aware legacy default snapshot check intentionally recognizes only the known pre-Open-Composition omissions. If a future platform release adds another default field, its omission should be added to that explicit compatibility list and covered by a contract test.

## Intentionally unchanged

- API persistence parsing remains sparse-first and backward compatible; no API migration was introduced.
- Legacy renderer paths, legacy Gallery rendering, V1–V7 schemas, and semantic compound accessibility/runtime behavior were preserved except where the shared resolver now supplies inherited visual defaults.
- No stored `managed: true` field was added to page payloads.
