# Phase 21 — Content Operations & Publishing Workflow

## Purpose

Phase 21 turns the existing Page Builder and immutable page-version model into a
day-to-day editorial workflow:

```text
edit content -> save draft -> preview -> inspect history -> restore as draft
             -> check readiness -> publish
```

Approval workflows, comments, collaboration, scheduling, AI, experiments,
external data sources, and binary object storage remain outside this phase.

## Source-truth baseline

Phase 20 already supplied the persistent `CmsShell` route boundary, GrapesJS
Model A `PageDocument` adapter, immutable `PageVersion` records, CAS pointer
advancement, published-only public rendering, bounded collection queries and
server-backed asset pickers. Phase 21 extends those seams without introducing
another page tree, history model, renderer, or workflow engine. The dedicated
`GET /pages/:pageId/versions/current` endpoint is the canonical current-draft
snapshot for editor reads and CAS writes; paginated history is display data.

## Content capability model

`PAGE_COMPONENT_REGISTRY` records the editing scope of each supported property;
unknown properties are design-scoped. Content scope is explicit rather than
inferred from a control name. The entire custom `form` editor is intentionally
design-scoped until a narrower copy-only form contract exists, and
`collection-list.queryId` is design-scoped because it changes the data source.
Structure, styles, responsive values, component attachments, queries, bindings,
actions, resources and layout attachments are design-scoped.

The shared `classifyPageDocumentChanges` contract compares node identity,
hierarchy, order, properties and composition structurally. It reports content
and design changes without serialized JSON comparison. The API applies it on
page update and version creation. A caller with `page.update` but without
`page.design` receives `PAGE_DESIGN_PERMISSION_REQUIRED` for a design mutation.

Owner and Admin retain `page.design`; the system Editor persona is content-only.
Existing custom roles with `page.update` are migrated to retain structural
editing capability by the tenant-scoped, one-time migration
`phase21-page-design-custom-role-backfill-v1`. The migration records completion
in the tenant `tenantMigrations` collection and stamps migrated/new custom roles
with capability version `1`; later role reads, lists, bootstraps and provisioning
do not infer or restore `page.design`. This preserves content-only custom roles
created after the split and preserves an administrator's explicit removal of
`page.design`. Asset metadata editing is separately protected by `asset.update`.

Ambiguous and behavioral properties are explicitly classified in the registry:
heading level and ordered-list semantics are content; list item structure,
video playback flags, accordion behavior, tab behavior, global-header
positioning, navigation source/responsiveness/alignment, site-brand display,
link targets and button targets are design. The full form editor and collection
query source remain design-scoped until narrower copy-only contracts exist.

Page creation, duplication and template application require both
`page.create` and `page.design`. Page metadata and page layout attachments are
design-scoped; content-only editors retain normal copy editing in the Builder.

## Content Editor Mode

The single Page Builder exposes Content and Design tabs. Users without
`page.design` open directly in Content mode. Content mode keeps the complete
canvas visible but limits the Inspector to registry content properties and
keeps only the asset surface in the left rail. Structural palette, layers,
layout, responsive and advanced controls are omitted. GrapesJS command and
canvas drag boundaries also reject structural commands when Design mode is not
enabled.

Explicit Save, dirty state, conflict handling and preview remain unchanged;
Phase 21 does not add autosave.

## Revision and restore workflow

Page detail history uses the existing immutable versions with bounded API
pagination. Rows expose Preview, readiness review, and permission-aware
Restore as draft actions. The editor and page detail use the canonical current
version endpoint for save/restore CAS, reset history pagination when the page
identity changes, and never infer current state from `versions[0]`. Restore
requires `page.rollback`, checks the current version number, clones the
historical payload/composition into a new version, advances
`currentDraftVersionId`, and leaves `publishedVersionId` unchanged. Legacy
payload-only targets receive an explicitly empty target composition rather
than inheriting mutable current-page layout or query state.
The renderer preview accepts an authenticated `versionNumber` query and never
changes public delivery.

## Publishing workflow

`GET /pages/:pageId/publish-readiness` validates the selected draft using the
same source services used by publish: route ownership/dynamic configuration,
document/composition validity, reusable/design-token dependencies, workflow
dependencies, extension validation and collection composition. The response
contains stable issue codes, blocking issues, warnings and a classifier-backed
change summary. A never-published page compares against an empty document
baseline, so its first-publish summary reports the authored additions. The
publish service repeats route and delivery validation to avoid treating
readiness as authorization or a TOCTOU-safe publish operation.

Pages now open a readiness dialog before publishing. It shows page/version,
public URL, current public version, content/design/component changes, warnings
and blockers. Publish is disabled while blocking issues exist. Unpublish stays
a separate action.

## Asset operations

Assets remain metadata references; no storage provider was invented. The
library supports server-backed search, media-type filtering and pagination.
`/workspaces/:workspaceId/assets/:assetId` is the canonical detail route and
edits title, default alt text and description while keeping storage key, MIME
type and size read-only.

`GET /workspaces/:workspaceId/assets/:assetId/usages` scans workspace-scoped
page versions, collection entry versions, template versions, reusable
documents, layout versions, site globals/design data and page SEO references.
It recognizes both asset IDs and legacy storage-key strings. The management
response is capped at 100 items and sets `truncated` only after observing a
101st match. Delete uses a separate exhaustive cursor scan, stops on the first
proven match, and fails closed with `ASSET_USAGE_CHECK_INCOMPLETE` if any
source cannot be verified. Delete returns `ASSET_IN_USE` when a match exists;
there is no force-delete path.

## Contracts and tests

The contracts package contains the classifier, editing metadata, restore input,
publish readiness/issue/summary schemas, asset metadata update schema and asset
usage response. Focused contract tests cover registry scopes, content/design
classification, structural changes, semantic composition comparison and
summary output. API tests cover exhaustive asset scans, workspace isolation,
fail-closed scan errors, design authorization, role migration boundaries, CAS
restore, legacy composition normalization and first-publish summaries. The
dedicated `tests/e2e/phase-21-closure.spec.ts` suite exercises the
current-version/readiness/CAS/restore seams through the API and proves both
content-only Builder save/reload and designer structural save/reload journeys.

## Intentional limitations

Binary upload/processing remains deferred. Asset usage display is bounded to
the first 100 references; deletion verification is exhaustive and fail-closed.
Author data is not added to old immutable version records where it was never
persisted.
Warnings remain empty until a source-backed non-blocking condition exists.
