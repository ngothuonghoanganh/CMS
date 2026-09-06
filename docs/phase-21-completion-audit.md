# Phase 21 completion audit

## Provenance

Original Phase 21 implementation HEAD: `6da922231f2f7ce1a8997585a5f03b6a579188b8`.
First closure-pass HEAD: `c224291ec4584ddd27105efb34a10559c979270a`.
Final security-closure starting HEAD: `c224291ec4584ddd27105efb34a10559c979270a`.
Final security-closure ending HEAD: `c224291ec4584ddd27105efb34a10559c979270a`
(the final closure changes are in the working tree and have not been committed).

The implementation preserves the Phase 20 route, editor, version, renderer,
collection and tenant invariants. The initial Phase 21 implementation and first
closure pass are committed at the provenance SHAs above; this final security
closure remains uncommitted in the shared worktree. The production build
regenerated the tracked Next route references from `.next/dev` to `.next/types`
in the CMS and renderer `next-env.d.ts` files; those generated changes are
retained as build output rather than hand-edited.

## Findings and closure

| Area             | Finding                                                      | Closure                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Capability model | `page.update` did not distinguish content from design        | Registry-scoped classifier plus API `page.design` enforcement                                                                                                             |
| Roles            | Editor could not be represented as content-only              | System Editor remains without `page.design`; custom update roles are migrated safely                                                                                      |
| Builder          | UI-only restrictions would allow keyboard/drag bypasses      | Content mode simplifies surfaces and command/canvas boundaries reject design commands                                                                                     |
| History          | Version list had no operational actions                      | Bounded history pagination, historical preview, readiness review and restore-as-new-draft                                                                                 |
| Restore          | No explicit CAS restore path                                 | `POST /pages/:pageId/versions/:versionNumber/restore` clones a new immutable version and preserves published pointer                                                      |
| Publish          | Direct publish skipped a review surface                      | Source-backed readiness endpoint and publish dialog; publish revalidates independently                                                                                    |
| Assets           | Inventory was fixed to a first-100 list                      | Server search/media filter/pagination and route-driven asset detail                                                                                                       |
| Asset metadata   | Only file identity was editable                              | Title, default alt text and description update contract/API/UI                                                                                                            |
| Asset deletion   | Bounded scans could miss late references                     | Separate exhaustive cursor scan across every supported source; delete fails closed on scan error and returns stable `ASSET_IN_USE` / `ASSET_USAGE_CHECK_INCOMPLETE` codes |
| Form semantics   | Whole custom editor was implicitly content-safe              | Form property is explicitly design-scoped across registry, Inspector, commands, classifier and API enforcement                                                            |
| Query semantics  | Collection query source could be changed as content          | `collection-list.queryId` is explicitly design-scoped and covered by classifier/API regression tests                                                                      |
| Page creation    | Editor could create a design-bearing initial document        | System Editor loses `page.create`; page create, duplicate and template apply require `page.create` plus `page.design`                                                     |
| Current version  | CAS/editing read could use a paginated history head          | Dedicated current-draft endpoint and page-identity pagination reset                                                                                                       |
| Restore          | Legacy restore could inherit mutable current composition     | Target payload/composition is authoritative; legacy targets normalize with empty composition and preserve published pointer                                               |
| First publish    | Never-published summary compared the draft with itself       | Readiness compares against an empty baseline and reports authored additions                                                                                               |
| Role migration   | Recurring seeding could re-add `page.design` to custom roles | Tenant-scoped migration marker plus capability version backfills pre-split custom roles once; recurring role reads/seeding never mutate custom capabilities               |
| Registry audit   | Ambiguous/behavioral fields relied on group fallback         | Explicit scopes for semantic heading/list fields and behavior/layout/navigation/media controls, with table-driven classifier coverage                                     |
| CMS permissions  | Content-only UI exposed design-bearing creation/metadata     | Shared `page.create` + `page.design` capability gates creation paths; metadata, layout attachments and template apply surfaces are design-gated                           |

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

The full repository quality-gate results are recorded in
`docs/continuity/phase-21-final-handoff.md` after the final gate run. Hosted
Foundation CI run #32 for the first closure-pass SHA failed before any job step
because the GitHub account was locked for a billing issue; it did not execute
the repository gates.
