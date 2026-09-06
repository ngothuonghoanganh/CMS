# Phase 21 completion audit

## Provenance

Starting closure-pass HEAD: `6da922231f2f7ce1a8997585a5f03b6a579188b8`.
Ending HEAD: `6da922231f2f7ce1a8997585a5f03b6a579188b8`.

The implementation preserves the Phase 20 route, editor, version, renderer,
collection and tenant invariants. No commit is created by this worktree pass;
the closure changes remain uncommitted in the shared worktree. The pre-existing
`apps/cms/next-env.d.ts` user edit was preserved.

## Findings and closure

| Area             | Finding                                                  | Closure                                                                                                                                                                   |
| ---------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Capability model | `page.update` did not distinguish content from design    | Registry-scoped classifier plus API `page.design` enforcement                                                                                                             |
| Roles            | Editor could not be represented as content-only          | System Editor remains without `page.design`; custom update roles are migrated safely                                                                                      |
| Builder          | UI-only restrictions would allow keyboard/drag bypasses  | Content mode simplifies surfaces and command/canvas boundaries reject design commands                                                                                     |
| History          | Version list had no operational actions                  | Bounded history pagination, historical preview, readiness review and restore-as-new-draft                                                                                 |
| Restore          | No explicit CAS restore path                             | `POST /pages/:pageId/versions/:versionNumber/restore` clones a new immutable version and preserves published pointer                                                      |
| Publish          | Direct publish skipped a review surface                  | Source-backed readiness endpoint and publish dialog; publish revalidates independently                                                                                    |
| Assets           | Inventory was fixed to a first-100 list                  | Server search/media filter/pagination and route-driven asset detail                                                                                                       |
| Asset metadata   | Only file identity was editable                          | Title, default alt text and description update contract/API/UI                                                                                                            |
| Asset deletion   | Bounded scans could miss late references                 | Separate exhaustive cursor scan across every supported source; delete fails closed on scan error and returns stable `ASSET_IN_USE` / `ASSET_USAGE_CHECK_INCOMPLETE` codes |
| Form semantics   | Whole custom editor was implicitly content-safe          | Form property is explicitly design-scoped across registry, Inspector, commands, classifier and API enforcement                                                            |
| Query semantics  | Collection query source could be changed as content      | `collection-list.queryId` is explicitly design-scoped and covered by classifier/API regression tests                                                                      |
| Page creation    | Editor could create a design-bearing initial document    | System Editor loses `page.create`; page create, duplicate and template apply require `page.create` plus `page.design`                                                     |
| Current version  | CAS/editing read could use a paginated history head      | Dedicated current-draft endpoint and page-identity pagination reset                                                                                                       |
| Restore          | Legacy restore could inherit mutable current composition | Target payload/composition is authoritative; legacy targets normalize with empty composition and preserve published pointer                                               |
| First publish    | Never-published summary compared the draft with itself   | Readiness compares against an empty baseline and reports authored additions                                                                                               |

## Source-backed asset usage scope

Usage inspection checks page draft/historical snapshots, collection entry
versions, template versions, reusable draft/published documents, layout
versions, site/global/design data and page SEO settings. It matches both UUID
asset references and legacy storage-key strings. The UI response is capped at
100 observed matches; deletion walks all cursors and fails closed on an
incomplete source. Binary storage ownership and provider deletion remain
intentionally outside the phase.

## Explicit non-goals verified

No approval state, reviewer/comment model, collaboration channel, AI action,
scheduled publication, A/B test, external data source or replacement workflow
engine was added.

## Validation record

Focused contract and API suites passed during implementation. The final full
repository quality-gate results are recorded in
`docs/continuity/phase-21-final-handoff.md` after the last gate run.
