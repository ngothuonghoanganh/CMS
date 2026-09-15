# PHASE 18.3 — Builder Validation UX & Deterministic Test Environment

## STARTING STATE

Branch: `main`
Starting SHA: `c07b7315d46d17171a25415e900a226a8e6235ad`
Ending SHA: `3731bb5` (implementation commit; the documentation commit follows)
Node: `v22.19.0` (the repository release engine is `>=24.0.0`)
pnpm: `10.15.0`

## VALIDATION AUDIT

Expected user-input exceptions found: constrained inspector properties and editor command rejections for URL/source, number, unit, color, responsive style, component-part style, and invalid placement. These now report normalized issues instead of reaching the global builder error path.

Hard invariant exceptions: duplicate persisted identity, invalid tree/parent-child relationships, root and descendant moves, illegal slots, unsupported editor nodes, invalid reusable structure, serializer failures, and unrecoverable persisted payloads remain strict.

Security validation: backend Zod/API validation remains authoritative. Safe URL, image/video source, CSS, protocol, and runtime checks remain strict; the authoring surface renders contextual errors.

System failures: unreachable API, unexpected save/publish failures, hydration/serializer failures, and runtime exceptions still use the global error surface.

## VALIDATION ARCHITECTURE

Before: `input onChange → editor command → schema/adapter throw → shell onError → global error`.

After: `local control draft → soft field validation → blur/Enter/explicit commit → editor command → strict document validation → save/publish API`. Invalid drafts retain the last valid document value and do not pollute persisted payloads.

## BUILDER VALIDATION ISSUE

Contract: `BuilderValidationIssue` contains stable `id`, `code`, `severity`, `scope`, `message`, `nodeId`, `documentId`, `tab`, `section`, `field`, `partName`, `viewport`, and normalized `path` fields where available.

Issue mapping: `BuilderAdapterError`, Zod-shaped errors, and actionable API responses are mapped to user copy and a field target. Technical parser messages are not shown as normal user copy.

Deduplication: stable issue identity is derived from document scope, document/node, tab, section, part, field, and viewport; duplicate IDs are collapsed before rendering.

Sorting: current scope, current node, current viewport, error severity, path, scope rank, viewport rank, and stable ID provide deterministic ordering.

## VALIDATION NAVIGATION

Document switch: page, site header, and site footer switch through the Builder document surface; reusable source issues stay in the active reusable editor. Navigation/design-system scopes are represented by the contract for future non-canvas surfaces.

Viewport switch: switches desktop/tablet/mobile before selecting the node.

Node selection: selects the issue `nodeId` through the GrapesJS selection bridge.

Inspector tab: activates content/style/settings when supplied.

Inspector section: expands the stable section key when supplied.

Component part: forwards `partName` and targets component-part fields without label or positional selectors.

Field scroll: finds `[data-builder-field]` using node, tab, section, part, and viewport identity and scrolls it into view.

Field focus: focuses the real input, textarea, select, or button.

Flash: applies `.builder-validation-flash` transiently for 1.5 seconds while persistent invalid styling remains.

Accessibility: invalid controls receive `aria-invalid="true"` and `aria-describedby`; the matching inline message has a stable ID and `role="alert"`. The summary is an accessible region with keyboard-operable rows.

## INPUT UX

Text: valid unconstrained content continues to commit live; required empty states can remain local while being edited.

URL: local draft while typing; blur/Enter commits only a safe URL; the last valid document value remains in the payload when the draft is invalid.

Number: supports temporary empty/invalid drafts; valid values commit without a global error.

Unit: raw local drafts are validated before commit; valid unit values retain the existing normalized editor behavior.

Spacing: uses the structured spacing control so authored values are normalized rather than persisting half-constructed CSS.

Color: local draft and soft validation; valid hex commits, invalid blur restores the last committed value without a global error.

Datetime: structured browser control commits valid values directly.

Select: direct commit.

Toggle: direct commit.

## SAVE VALIDATION

Result: error issues block Save, open the compact navigator, and focus the first actionable issue. Warnings remain non-blocking. Successful save clears resolved validation state.

## PUBLISH VALIDATION

Result: publish remains backend-authoritative. Non-5xx structured/domain failures become contextual validation issues; unexpected failures remain global. The existing saved-draft precondition is preserved.

## CANVAS UX

Invalid node indicator: issue-bearing nodes receive a thin, non-persisted invalid class/outline in the Canvas.

Invalid drop: invalid placement shows contextual `drop-invalid` feedback and a local status message; the document is not mutated and no global toast is emitted.

Resolved state: fixing a field removes its inline, Canvas, Layers, and navigator state immediately.

## LAYERS UX

Warning indicator: each invalid node is marked once with a compact `!` marker in Layers.

Issue navigation: selecting the row still uses the normal Canvas selection bridge; navigator rows can focus the exact issue target.

## TEST ENVIRONMENT

Canonical tenant: `E2E Development`
Canonical tenant ID: `3ad43433-cbfc-4dfd-a760-e8c85860210e`

Canonical workspace: `E2E Workspace`
Canonical workspace ID: `a793634c-4f54-4386-8854-9368a8555322`

Canonical site: `E2E Builder Site` (`e2e-builder`)
Canonical site ID: `af0ebd15-29d9-4bcb-8847-6794715e12d5`

Canonical page: `E2E Home` (`e2e-home`, `/`)
Canonical page ID: `60ce8607-be95-4f32-8072-7fae617e1384`

`ensureCanonicalEnvironment()` is idempotent and normalizes the baseline. Normal Builder/renderer/component/forms/publishing/reusable/globals/SEO tests use this tenant and site. Tests needing isolation create `__e2e__` temporary pages and dispose them.

## TEST DATA BEFORE

Tenant count: `287`
Site count: `1` on the canonical workspace
Temporary pages: `0`

## TEST DATA AFTER NORMAL E2E

Tenant count: `287`
Site count: `1` on the canonical workspace
Temporary pages: `0`

Tenant delta: `0`
Site delta: `0`
Temporary resource delta: `0` pages and `0` temporary integrations

## TENANCY SUITE

Created tenants: tenancy suite ran as 7 tests; the standalone tenancy run plus full run raised the observed tenant count from `287` to `297`. The created records are deterministic-by-pattern for reporting, but are not silently deleted because the API has no safe tenant/site teardown endpoint.

Isolation: tenant context switching, cross-tenant 404 behavior, extension scope, billing scope, and control-plane provisioning remain green.

Cleanup: tenancy tests remain tagged `@tenancy` and are excluded from `pnpm test:e2e`; canonical reset runs before and after ordinary tests.

Database cleanup: no unsafe production-style tenant deletion or database drop was added. Existing legacy E2E tenants are reported for review; test-owned pages, integrations, domains, globals, design-system drafts, and reusables are safely reset/deleted.

## CLEANUP SCRIPT

Dry run: `pnpm test:data:cleanup --dry-run` passed; it reported `293` legacy E2E tenants, `0` canonical-site pages, `0` temporary integrations, and `0` public routes to remove. No data changed.

Apply: `--apply` is limited to known temporary page/integration/domain markers and unbinds integrations before deletion. It does not delete tenant records or arbitrary sites/databases. An earlier safe apply removed two orphaned legacy integrations; final dry-run state is clean.

Protected resources: canonical tenant/workspace/site/page, non-E2E resources, and public routes are protected. The script uses explicit names/slugs/prefixes and never `deleteMany({})` or arbitrary database drops.

## TEST RESULTS

format: `pnpm exec prettier --check .` — pass
lint: `pnpm lint` — pass
typecheck: `pnpm typecheck` — pass
unit: `pnpm test` — pass: CMS `105`, contracts `39`, renderer `19`, API `48` passed; API `12` skipped by existing integration configuration
build: `pnpm build` — pass

validation UX E2E: `6/6` repeated validation runs passed; the final focused run is included in full E2E.

Phase 18.2 regression: `11/11` passed.

normal E2E: `pnpm test:e2e` — `62/62` passed.

tenancy E2E: `pnpm test:e2e:tenancy` — `7/7` passed.

full E2E: `pnpm test:e2e:full` — `69/69` passed.

## UX TEST CASES

Partial URL: pass; local `https://` draft, inline error, last valid payload retained, valid commit clears the issue.

Invalid opacity: pass; `1.5` stays local and does not enter the document.

Invalid color: pass; `#12` stays local and does not produce a global error; valid `#112233` clears it.

Button URL: pass; Save is blocked and the URL field is focused.

Mobile field: coordinator supports viewport targeting; no dedicated mobile-invalid-field E2E was added.

Component part: part metadata and stable targeting are implemented and Phase 18.2 part-style regressions pass; no dedicated invalid-part navigator E2E was added.

Header: page/header document switching is wired; no dedicated invalid-header navigator E2E was added.

Footer: page/footer document switching is wired; no dedicated invalid-footer navigator E2E was added.

Multiple issues: stable contract deduplication/sorting and clickable navigator rows are implemented; no dedicated three-row removal E2E was added.

Layers indicator: implemented with one marker per invalid node.

Canvas indicator: implemented as non-persisted node styling.

Invalid drag: existing invalid-drop regression passes; no mutation and no global error.

Focus: pass for the actionable Button URL flow.

Flash: pass for the actionable Button URL flow; class removal leaves persistent invalid state until resolution.

aria-invalid: pass for the actionable Button URL flow with matching `aria-describedby` message.

## REGRESSION

Builder ↔ Preview: preserved and covered by full E2E.

Preview ↔ Published: preserved and covered by renderer/publishing E2E.

Responsive: preserved; viewport changes remain presentational and responsive style tests pass.

Parts styles: preserved; Phase 18.2 responsive component-part style test passes.

Reusable identity: preserved; Phase 18.2 reusable identity test passes.

Header/Footer: global draft/publish regression passes.

Navigation: navigation runtime and existing global/navigation regression passes.

Undo/Redo: existing component/style/history regressions pass.

## REMAINING ISSUES

P0: none found.

P1:

- The current API has no safe organization/site/tenant-database teardown endpoint. Cleanup therefore reports `293` legacy E2E tenants instead of deleting them. A test-only teardown utility or an explicit lifecycle API is needed before CI can claim zero tenant residue after tenancy runs.
- The required release engine is Node `>=24.0.0`, but this workstation has Node `22.19.0`; all checks passed with engine warnings, not on the required release runtime.

P2:

- Reusable/non-canvas navigation scopes are represented in the issue contract but do not have separate Builder surfaces to switch to.
- Dedicated automated coverage for mobile field navigation, component-part issue navigation, header/footer issue navigation, multiple-issue removal, and global/system-error separation remains.

## FINAL DECISION

VALIDATION UX IMPROVED: `YES`
GLOBAL ERROR SPAM REMOVED: `YES` for ordinary constrained input; system errors remain global
ERROR NAVIGATION WORKING: `YES` for implemented page/header/footer field flow
CANONICAL TEST TENANT WORKING: `YES`
CANONICAL TEST SITE WORKING: `YES`
NORMAL E2E DATA LEAK: `NO` — tenant/site/temp-resource delta is zero
PHASE 18.3 PASS: `CONDITIONAL` — core UX and all executed suites pass; P1 release prerequisites remain
SAFE TO START PHASE 19: `NO` — install Node 24 and provide safe tenancy teardown before the next release gate
