# R0 — Deep Codebase Audit

Status: completed and reconciled with the current working tree.

Audit date: 2026-08-26

Scope: repository structure, runtime boundaries, editor state, page/version persistence,
renderer parity, tenancy, CMS shell and builder UX, tests, performance and security
boundaries. The report was re-checked against the current source and uncommitted
changes on 2026-08-26.

## Executive summary

The repository is a pnpm/Turborepo monorepo containing a NestJS API, a Next.js CMS,
an independent Next.js renderer, shared Zod contracts and a small CLI. The product
already has substantial domain coverage: page versions and publishing, forms,
integrations, analytics, custom domains, organizations/workspaces, RBAC, billing,
extensions and workflows.

The builder now has an explicit Model-A PageDocument compatibility seam: GrapesJS is
the live mutable document model, while the contracts package wraps the versioned
`PagePayload` in a validated `PageDocument` envelope for editor/preview boundaries.
React still holds only derived snapshots for selection, layers, inspector and canvas
state. The command layer is the shared mutation vocabulary for structural and
property edits; this is intentionally not a second document store.

The most important reliability finding was a save acknowledgement race: an edit made
while a save request is in flight could be followed by an unconditional `saved` status
when the older request resolved. The current worktree now guards that acknowledgement,
but the behavior remains a regression contract that needs browser coverage.
The API now combines optimistic version checks with the unique version index and an
atomic compare-and-set update of the current-draft pointer. Duplicate version races
and pointer mismatches normalize to a 409 conflict; extension synchronization remains
a separately observable side effect after the durable version write.

The second confirmed editor bug was an incomplete type discriminator. The adapter,
contract and extension registry support `extension`, but the shared drag/layer
interaction discriminator omitted it. The current worktree includes the additive
case and a focused regression test; the shared registry is still duplicated in several
builder modules.

The tenant boundary is generally explicit and well structured: master data resolves a
tenant, `AsyncLocalStorage` binds the request, and tenant model proxies resolve against
the current tenant connection. No confirmed cross-tenant read/write was found in the
traced paths. The boundary remains high-risk because connection routing, public
resolution, background work and every new query rely on convention; targeted isolation
tests must remain a release gate.

The CMS shell has improved shared primitives and responsive handling, but the main
dashboard is still a large orchestration component. It contains multiple resource
fetch effects and resource-specific state. The current worktree removes the duplicate
page refresh trigger and guards stale selected-page/submission responses. The builder
inspector and block labels now derive from the shared component/property registry,
including Content/Style/Advanced grouping and responsive inheritance hints. Overlay
focus is restored, Escape and body locking are supported, and the shared Modal/Drawer
implementation now traps Tab focus within the open surface.

The first safe fixes from this audit are intentionally narrow: protect builder save
state from in-flight edits and include extension nodes in the shared interaction
contract. No payload rewrite, framework change, new state library or large UI rewrite
is justified by the current evidence.

## A. Repository structure

### Topology

```text
payload-landing-page-platform/
├── apps/
│   ├── api/       NestJS modular monolith, tenant-aware HTTP API
│   ├── cms/       Next.js client admin and GrapesJS visual builder
│   └── renderer/  Next.js public/preview renderer
├── packages/
│   ├── contracts/ Shared Zod schemas, TypeScript types and payload helpers
│   └── cli/       Global launcher package
├── tests/e2e/     Playwright workflow coverage
├── docs/          Architecture, phase, UX, extension and recovery documentation
├── docker-compose.yml
├── pnpm-workspace.yaml
└── turbo.json
```

This is a monorepo. `pnpm-workspace.yaml` covers `apps/*` and `packages/*`; Turbo
coordinates package scripts. There is no `.github` CI workflow in the repository at
audit time. The executable quality gate is the root `verify` script:

```text
format:check → lint → typecheck → test → build
```

The repository package manager is pinned to pnpm 10.15.0 and the root engine requires
Node >=24. The audit environment had Node 22.19.0 and global pnpm 8.7.6; commands
must therefore be run through Corepack (`corepack pnpm ...`) until the local toolchain
is upgraded.

## B. Technology stack

| Area             | Current implementation                                                        |
| ---------------- | ----------------------------------------------------------------------------- |
| Package/build    | pnpm 10.15, Turborepo 2.10, TypeScript 5.9                                    |
| API              | NestJS 11, Express 5, Mongoose 8, pino/pino-http                              |
| CMS              | Next.js 16, React 19, GrapesJS 0.23                                           |
| Renderer         | Next.js 16, React 19, server rendering plus client analytics/forms            |
| Contracts        | Zod 4, strict discriminated payload schemas                                   |
| Unit/integration | Vitest 3; API has the largest suite, contracts and builder have focused specs |
| Browser E2E      | Playwright 1.55, 11 workflow specs                                            |
| Persistence      | Master MongoDB connection plus per-tenant MongoDB connections                 |
| Auth             | Signed HS256 access token, hashed rotating refresh sessions, HttpOnly cookies |
| Styling/UI       | CSS token files and local shared primitives under `apps/cms/app/ui`           |
| CI               | No checked-in GitHub workflow detected; local scripts are the visible gate    |

No new dependency is needed for the first recovery fixes.

## C. Applications and packages

### API

`apps/api/src/app.module.ts` wires the master/control-plane modules, authentication,
tenant management, domain modules, security, extensions, workflows, billing and
health. `apps/api/src/main.ts` configures the global `api/v1` prefix, request IDs,
JSON size limit and CORS.

The domain surface includes sites, pages/versions, assets, SEO, custom domains,
submissions/forms, integrations, analytics, organizations/workspaces and templates.
Security includes users, roles, permissions and audit logs. Extensions and workflows
are separate modules with registry/runtime contracts.

### CMS

The CMS has a protected root dashboard, login route, shared header/sidebar/form/surface
primitives and a builder route:

```text
/workspaces/:workspaceId/sites/:siteId/pages/:pageId/builder
```

The dashboard currently owns most resource state and mutations. The builder is split
between `builder-shell.tsx` (orchestration and UI), `grapes-editor.tsx` (GrapesJS
adapter/runtime), `builder-adapter.ts` (payload ↔ editor mapping),
`builder-interaction.ts` (structural move semantics) and a minimap.

### Renderer

The renderer supports:

```text
/site-slug/page-slug             published public page
/preview/page-id                 authenticated draft preview
/                                 custom-domain resolution or renderer shell
/robots.txt, /sitemap.xml        custom-domain SEO endpoints
```

`renderer.tsx` and `form-renderer.tsx` render the strict shared payload. The public
page API calls are no-store and request-deduplicated within a React server render.

### Shared contracts

`packages/contracts/src/index.ts` is the canonical transport contract today. It has a
strict `PagePayloadSchema` discriminated union for versions 1, 2 and 3. V2 adds forms;
V3 adds countdown and extension leaves. It also defines page/version/list/auth,
extension, workflow, SEO, analytics, billing and tenancy contracts. Payload size,
depth, duplicate IDs, child rules and URL safety are checked at the boundary.

## D. Current data flow

### Browser to API

```text
CMS browser
  │ cookies: access + refresh
  ▼
Next proxy: cookie presence gate
  ▼
apps/cms/app/lib/api.ts
  ├── credentials: include
  ├── one in-flight refresh for 401 auth failures
  └── exact-path GET coalescing while a request is pending
  ▼
NestJS controller + ZodValidationPipe
  ▼
AuthenticationGuard → TenantResolutionMiddleware/TenantContext
  ▼
AuthorizationService + explicit workspace filters
  ▼
tenant model proxy → tenant MongoDB database
```

The Next proxy is only a UX redirect. It checks cookie presence, not token validity;
API authentication and authorization remain authoritative.

### Page read flow

```text
CMS dashboard/builder
  → GET /pages/:id, /versions, assets, extensions
  → API PageService
  → LandingPageRecord + PageVersionRecord in current tenant DB
  → contract parse before response
```

The selected page, versions, form bindings and SEO settings are held separately in
the dashboard. The builder loads its own page/version/assets and extension data.

### Public flow

```text
Renderer request
  → hostname/path extraction
  → API public route
  → middleware resolves tenant from host/slug
  → PublicPageResolver checks site/page/workspace/published pointer
  → PageService builds PublicLandingPage
  → strict response parse in renderer
  → shared renderer registry
```

For custom domains, the renderer resolves the hostname at `/`; for platform hosts it
renders the shell. Public resolution uses the tenant context and only published
versions. Draft preview forwards cookies to the authenticated preview endpoint.

## E. Current editor state flow

The actual source-of-truth arrangement is transitional:

```text
PageVersion.payload from API
          │ initial hydration only
          ▼
GrapesJS Component model  ← live mutable editor document
     ┌────┼───────────────┬───────────────┐
     ▼    ▼               ▼               ▼
  Canvas Layers       Inspector       History
  derived snapshot   derived tree    GrapesJS undo
     │    │               │               │
     └────┴──── commands/mutations ───────┘
                         │
                         ▼
                 serializePagePayload()
                         │
                         ▼
                 explicit POST version
```

Important details:

- `BuilderShell` stores `payload`, but it is the loaded payload, not a continuously
  authoritative React document. It is not updated after each editor mutation.
- `GrapesEditor` keeps the live GrapesJS model in its own runtime and exposes imperative
  methods through a ref. Selection, canvas state and history are emitted as snapshots.
- The inspector writes through editor imperative methods; it does not own a second
  persisted payload.
- Layers and canvas structural movement both call the shared `moveNodeByIntent` path,
  which is the correct direction for the future command engine.
- The API DTO and renderer payload are strict `PagePayload` snapshots, not the
  GrapesJS object graph.

Therefore the target diagram in the recovery context is not yet implemented:

```text
Canvas ─┐
Layers ─┼─> PageDocument ─> History ─> Save ─> Renderer
Inspector ┘
```

The low-risk migration seam is to introduce command/document interfaces around the
existing adapter and keep `PagePayload` backward compatible. Replacing GrapesJS in one
pass would be unnecessarily risky.

## F. API flow and persistence

`PageService` has separate immutable version records and a mutable page pointer:

```text
create page
  → create LandingPageRecord
  → create PageVersionRecord(version 1)
  → set currentDraftVersionId
  → synchronize page extensions

create version
  → read latest version
  → compare expectedVersionNumber
  → create next immutable version
  → update page.currentDraftVersionId
  → synchronize extensions

publish
  → select requested/current draft version
  → validate workflow and extension dependencies
  → compile published bundle on version
  → set page.publishedVersionId
  → publish event and extension hook
```

Every traced tenant-domain query includes a `workspaceId` where the service receives
one. Page, site, version, submission, analytics, integration, asset, template, SEO,
domain and audit paths were specifically checked. Public resolver queries rely on the
already-resolved tenant database and add page/site/workspace relationships before
returning content.

The current optimistic check is a separate latest-version read followed by insert.
The unique `{ landingPageId, versionNumber }` index prevents duplicate version
numbers, but it is not a complete atomic mutation protocol. Pointer updates and
extension synchronization can also be left at different stages if a later operation
fails.

## G. Builder → save → renderer flow

```text
1. Builder loads current draft PageVersion.payload.
2. Adapter converts payload nodes into GrapesJS components.
3. User action mutates GrapesJS; callbacks mark the shell unsaved.
4. User clicks Save draft.
5. Adapter serializes the live model and strict-parses PagePayload.
6. CMS POSTs /pages/:pageId/versions with expectedVersionNumber.
7. API persists a new immutable version and current-draft pointer.
8. CMS refreshes page extension instances and displays saved state.
9. Preview initially reads /preview/pages/:pageId and the renderer renders the draft;
   subsequent unsaved PageDocument snapshots stream to the preview window through a
   schema-validated, origin-checked postMessage bridge.
10. Publish compiles/validates the selected version and advances published pointer.
11. Public renderer reads only the published pointer.
```

There is no continuous polling loop in the builder or renderer. “Reload latest draft”
and context switching remain explicit recovery actions; local preview updates do not
perform API reads.

## H. Multi-tenant flow

```text
Master DB
  ├── tenant/company metadata
  ├── databaseName / clusterKey mapping
  ├── domains
  └── platform users/plans
        │ resolve by token tid, hostname, slug or login input
        ▼
TenantResolutionMiddleware
        ▼
TenantContext (AsyncLocalStorage scope)
        ▼
TenantConnectionManager cache
        ▼
TenantModelRegistry dynamic proxy
        ▼
Tenant DB models and workspace-scoped queries
```

The access token carries tenant and session context. Authentication re-resolves the
tenant from signed token claims, verifies the session/user and binds the tenant scope.
Refresh tokens are prefixed with tenant identity, hashed in session storage and
rotated. Workspace authorization is separate from tenant resolution.

The connection cache key is `${clusterKey}:${databaseName}` and is bounded by count
and idle TTL. The current URI builder replaces the database pathname in the single
configured `MONGODB_URI`; `clusterKey` is a cache identity/future seam, not a distinct
configured cluster route today. If multiple clusters become real, URI routing must be
made explicit before enabling them.

No tenant database connection is selected by mutating a global/default Mongoose
connection. This is a strong foundation. Background jobs and new endpoints must still
enter a tenant scope explicitly; the request middleware alone cannot protect work that
does not originate in an HTTP request.

## I. Critical bugs

| ID    | Severity | Evidence                                              | Root cause                                                                 | Immediate treatment                                                       |
| ----- | -------- | ----------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| R0-01 | P0       | `apps/cms/builder/builder-shell.tsx:735-785`          | Save response could mark newer local edits as saved                        | Fixed in current worktree with mutation sequence and one in-flight guard  |
| R0-02 | P1       | `apps/cms/builder/builder-interaction.ts:35-46`       | `isBuilderNodeType` omitted `extension` while adapter/contracts support it | Fixed in current worktree; focused regression test added                  |
| R0-03 | P1       | `apps/cms/app/cms-dashboard.tsx:296-317`              | Two effects could call `refreshPages` for one site/view transition         | Fixed in current worktree by separating site and view-triggered refreshes |
| R0-04 | P1       | `apps/cms/app/cms-dashboard.tsx:319-334,692-751`      | Page detail responses could overwrite a newer selection                    | Fixed in current worktree with request sequence guards                    |
| R0-05 | P1       | `apps/cms/app/cms-dashboard.tsx:336-341,709-726`      | Older submission filter response could overwrite a newer list              | Fixed in current worktree with request sequence guards                    |
| R0-06 | P1       | `apps/api/src/domain/page.service.ts:151-235,300-340` | Version check, insert and pointer update are not one transaction/CAS       | Add server-side atomic revision protocol and failure recovery tests       |

R0-01 is the only confirmed data-loss presentation race in the critical builder path
that can be fixed without deciding the final PageDocument shape. R0-06 is a server
consistency risk, not evidence that current tenant data is already corrupt.

## J. Architecture smells

### State and responsibilities

- `BuilderShell` owns load/save/extension state, selection/layers, canvas controls,
  inspector rendering, navigation guards and notifications. It is 1,759 lines.
- `cms-dashboard.tsx` owns bootstrap, navigation, all resource lists, forms and most
  mutations. It is 2,683 lines and has 24 local state hooks.
- `payload` is retained in the builder after hydration even though GrapesJS owns live
  edits. This is safe today because save reads `editorRef.current.serialize()`, but it
  is a misleading duplicate if future code reads it as current state.
- There is no explicit PageDocument revision object, command registry, history adapter
  or shared selection store.

### Duplicated contracts and mapping logic

- Builder node type checks and child rules are duplicated between the shared contract,
  `builder-adapter.ts` and `builder-interaction.ts`.
- Style property metadata is maintained in the builder shell and renderer separately.
- Editor node metadata, labels and allowed children are adapter-local rather than a
  component registry consumed by both editor and renderer.
- API response typing in `apps/cms/app/lib/api.ts` is generic/cast-based; boundary
  schemas are applied by callers rather than by one typed query layer.

### Effects and cache boundaries

- The API client only coalesces exact concurrent GETs; it is not a persistent query
  cache. This is simpler and avoids cross-context cache retention, but it leaves each
  screen to coordinate its own stale responses.
- Dashboard effects are functions recreated on render and intentionally omitted from
  exhaustive dependency lists in places. They are currently bounded, but extraction
  into query/resource hooks should preserve explicit dependencies.
- Renderer uses React `cache` plus `no-store`, which is appropriate for request-local
  deduplication. The timestamp nonce means every independent request bypasses fetch
  caching; it is useful for publish freshness but should be revisited in production
  with a deliberate cache/revalidation policy.

### Persistence boundary

- Page version immutability is represented in the schema, but the page pointer and
  version insert are coordinated by application code rather than a transaction.
- Extension synchronization is coupled to version creation. It correctly keeps the
  payload and extension instances related, but failure semantics need an explicit
  outbox/transaction decision before collaboration or autosave is added.

## K. UX problems

### CMS shell and resources

- The main dashboard mixes navigation, lists, create forms, edit forms, detail views
  and mutation handlers in one component. This makes task hierarchy and loading/error
  ownership difficult to reason about.
- Pages are fetched with a fixed `limit=100`; the API has pagination, but the main page
  list does not expose pagination for more than 100 pages.
- Shared UI primitives exist (`fields.tsx`, `surfaces.tsx`, `system.css`), but resource
  screens still contain local/native patterns and the design system is not a package or
  a schema-backed component contract.
- Empty/error/loading/feedback states are present in many paths but not governed by a
  consistent screen state model.

### Builder

- The builder shell has a useful three-area desktop structure, layer tree, breakpoint
  controls, undo/redo and semantic before/inside/after drag intent.
- The inspector uses hand-maintained field arrays. It has progressive disclosure with
  details sections, but no Content/Style/Advanced schema contract per component and no
  explicit inherited-vs-overridden responsive indicator.
- The builder header has Back, save status, Undo/Redo and Save draft. Preview and
  publish remain on the CMS page view rather than the builder, which is a product
  hierarchy decision but makes the critical editor workflow less discoverable.
- Layer rows have selection, expand/collapse, drag handles and auto-scroll. The common
  interaction path is good, but extension nodes are currently rejected by the type
  guard and there is no virtualization/search for very large trees.
- The shared overlay focuses an initial control, handles Escape, body scroll, focus
  restoration and Tab/Shift+Tab containment. The boundary behavior is covered by the
  CMS shell E2E flow; nested and empty-surface cases remain untested.

### Responsive and accessibility

- CSS includes responsive shell behavior and internal table scrolling, but there is no
  comprehensive Playwright viewport matrix for 320/375/390/768/1024/1280/1440/1920.
- Mobile sidebar has a focus loop; the generic overlay does not share that behavior.
- Icon/action labels are generally present in the builder, but audit coverage is not
  systematic for every screen and popover/dropdown.

## L. Dead and duplicate code inventory

No broad deletion is authorized from this audit. Usage was checked before listing
refactor candidates.

### Confirmed duplication / consolidation candidates

| Candidate                                  | Locations                                                                         | Safe next action                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Builder node discriminator and child rules | `packages/contracts/src/index.ts`, `builder-adapter.ts`, `builder-interaction.ts` | Export/reuse a single typed registry after regression coverage |
| Style property metadata                    | `apps/cms/builder/builder-shell.tsx`, `apps/renderer/app/renderer.tsx`            | Define shared style semantics without changing payload names   |
| Page/resource request parsing              | CMS callers plus `apps/cms/app/lib/api.ts`                                        | Extract typed query helpers incrementally                      |
| Dashboard fetch orchestration              | `cms-dashboard.tsx`                                                               | Split by resource only after request identity tests exist      |
| Modal/Drawer focus behavior                | `apps/cms/app/ui/surfaces.tsx` and mobile sidebar                                 | Extract one accessible focus utility                           |

### Not dead

- The GrapesJS adapter is actively used by the builder and covered by adapter specs.
- The extension and workflow modules are used by API controllers, page publish and E2E
  flows; they are not abandoned experiments.
- The old phase documents are historical documentation, not source candidates for
  deletion.

## M. Test gaps

The repository has 39 unit/integration spec files in the inspected source/package/test
paths and 11 Playwright E2E files. Existing E2E coverage includes API, CMS, publishing,
forms, integrations, analytics, domains/SEO, renderer, billing, organizations and
workflows. API integration coverage verifies version conflicts, publish isolation,
domain ownership and tenant/workspace behavior.

### Strong existing coverage

- Strict payload validation, versioned payload behavior and duplicate IDs.
- API page create/version/publish/unpublish flows.
- Forms from builder through preview/publish/submission.
- Integrations, webhooks, analytics, domains/SEO, RBAC and tenant organizations.
- Extension registry, page extension lifecycle and workflows.
- Renderer component coverage in `apps/renderer/app/renderer.spec.tsx`.

### Missing or insufficient coverage

- Browser-level builder save while a local mutation occurs during the network request;
  the acknowledgement helper itself has focused unit coverage.
- Extension node movement through the shared layer/canvas intent path; the node-type
  boundary itself now has focused unit coverage.
- A full Canvas → selection → Layers and Layers → selection → Canvas browser assertion.
- Reparent and same-parent ordering through save and reload as separate tests.
- Responsive base/tablet/mobile inheritance and inspector override semantics.
- Network idle regression: open a screen, wait 10 seconds, assert no unexpected request
  repetition.
- More complete Modal/Drawer keyboard coverage, including nested/empty surfaces and
  focus restoration after close.
- All required viewport widths and horizontal overflow assertions.
- Server-level concurrent version creation and pointer consistency under failure.
- Background-job tenant context, if/when background jobs are introduced.

The next test additions should stay close to the two small code fixes and the save
protocol; a broad visual suite is not a prerequisite for those changes.

## N. Performance risks

### Measured by code shape, not yet benchmarked

- A 2,683-line dashboard rerenders a large subtree whenever any resource state changes.
- Builder layer rendering recursively walks the current snapshot and calls `nodes.some`
  for each node, which is quadratic in the number of nodes in the worst case.
- `findPayloadComponent` traverses the GrapesJS tree for each structural intent; this
  is predictable but can become noticeable for large documents.
- Serialization validates and stringifies the complete payload on each explicit save.
- The renderer timestamp nonce disables upstream fetch reuse for every request.
- Lists commonly request up to 100 records; pages, assets, templates and integrations
  need server pagination as datasets grow.

### Deferred until measurement

Do not virtualize layers or add memoization solely from these observations. First add
large-page and request-count measurements, then optimize the actual bottleneck while
preserving the document contract.

## O. Security risks and controls

### Controls present

- Strict Zod validation at API boundaries and strict response validation in the
  renderer/builder.
- Workspace filters on traced tenant-domain queries.
- Authentication guard verifies signed access tokens and active sessions.
- Refresh sessions are hashed and rotated; cookies are HttpOnly/SameSite.
- Tenant models resolve from `TenantContext`, not a mutable global connection.
- Public content uses published pointers only; preview is authenticated.
- URLs, payload depth, serialized payload size and extension contracts are constrained.
- Integration secrets use a dedicated vault abstraction and are not sent as normal
  resource data.

### Risks to keep on the gate

- A new service can accidentally omit `workspaceId` or execute outside a tenant scope;
  convention is not a proof. Add query-boundary tests for each new resource.
- `clusterKey` currently does not select a different URI/cluster. Do not expose
  multi-cluster routing until that seam is explicit and tested.
- Custom domain/host resolution depends on trusted proxy configuration and normalized
  host handling; production deployments must set `TRUST_PROXY` correctly.
- Builder/renderer extension parity depends on registry and manifest validation. Any
  new extension node must have adapter, contract and renderer/compiled-runtime tests.
- The Next CMS proxy cookie check can redirect unauthenticated users but does not
  authorize access; never treat it as a security boundary.

No evidence was found that the builder accepts arbitrary executable JavaScript as part
of the current payload contract. That invariant must remain true unless an explicit,
permissioned feature is designed.

## P. Recommended changes

The recommendations are ordered by reliability and migration safety.

### P0 / immediate

1. Keep the local mutation sequence and in-flight save guard in `BuilderShell`. A save
   response may advance the server version, but it must leave the UI `unsaved` if a
   later local mutation happened before the response. Do not introduce autosave yet.
2. Keep `extension` in the shared builder node discriminator and its focused structural
   interaction regression test.
3. Keep explicit save as the only persistence trigger until revision semantics are
   formalized.

### R1 editor foundation

4. [Implemented] Define a small `PageDocument`/editor revision interface around the
   existing strict `PagePayload`; the document is an adapter-backed Model-A envelope,
   so no database schema rewrite is required.
5. [Implemented] Move insert/move/reparent/remove/duplicate/property/style mutations
   behind a command surface used by Canvas, Layers, Inspector and keyboard shortcuts.
   GrapesJS remains the single live model and its UndoManager remains the history owner.
6. [Implemented] Add typed component definitions with slots, allowed children,
   property metadata and migration metadata; builder adapter and renderer consume the
   same registry.
7. [Implemented] Make version creation use a unique-version conflict guard plus an
   atomic compare-and-set update for the current-draft pointer. Concurrent writer and
   injected-failure tests remain a follow-up.
8. Add request identity/cancellation to dashboard selected-page details and submissions;
   then split the dashboard by resource without introducing a second global store.

### R2 design system

9. Extend the shared primitives in `apps/cms/app/ui`: nested/empty-surface focus
   coverage, consistent toast/feedback, table/pagination, empty/error/loading state
   patterns, semantic controls and z-index scale.
10. Keep one CMS UI system. Do not add a parallel UI package until existing primitives
    have been evaluated against the full screen needs.

### R3 builder UX

11. [Implemented] Derive inspector sections from component property schemas with
    Content/Style/Advanced groups and responsive inheritance hints.
12. [Implemented] Add layer search, explicit invalid-drop feedback, extension-node
    interactions and keyboard tree navigation with Canvas/Inspector selection sync.
13. [Implemented] Add live preview, zoom and breakpoint affordances after the save and
    revision seam; preview updates use a validated, origin-checked postMessage bridge.

### R4–R6

14. Refactor CMS resource screens to table + toolbar + dedicated page/drawer patterns.
15. Add renderer parity, responsive and tenant-isolation gates for each new component
    or resource.
16. Add observability around tenant resolution, save/publish failures and renderer
    invalid payloads without logging tokens, secrets or content unnecessarily.

## Q. File-level impact map

Each recommendation below names the first affected locations, current responsibility,
target responsibility, migration risk and required tests.

| Recommendation                          | Affected files/modules                                                                                                                   | Current responsibility                                                    | Target responsibility                                                            | Migration risk                             | Required tests                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------- |
| Save revision guard                     | `apps/cms/builder/builder-shell.tsx`, `apps/cms/builder/grapes-editor.tsx`                                                               | Shell tracks dirty state; GrapesJS emits mutations; save posts snapshots  | Save state reflects the latest local mutation sequence and one in-flight request | Low; no payload/API change                 | Deferred response after mutation; failed save; 409 conflict; normal save/reload |
| Complete extension interaction contract | `apps/cms/builder/builder-interaction.ts`, `builder-adapter.ts`, `builder-extension-registry.spec.ts` or new interaction spec            | Adapter knows extension; interaction type guard validates core types only | Every supported payload node passes the same structural interaction boundary     | Low; additive union case                   | Extension `payloadNodeType`; move/reparent valid/invalid intents                |
| Remove duplicate page refresh trigger   | `apps/cms/app/cms-dashboard.tsx`                                                                                                         | Two effects can refresh pages for the same site/view transition           | One effect owns site changes; view-only effect owns domain/SEO entry             | Low; request timing changes                | Mock request count on site change and view transition                           |
| Guard dashboard stale reads             | `apps/cms/app/cms-dashboard.tsx`                                                                                                         | Selected page/submission effects write whichever response resolves last   | Request sequence/abort owns each visible query result                            | Medium; must preserve empty/reset behavior | Rapid page/filter changes with out-of-order responses                           |
| Formal PageDocument seam                | `apps/cms/builder/builder-adapter.ts`, `grapes-editor.tsx`, `packages/contracts/src/index.ts`                                            | GrapesJS model and PagePayload adapter are implicit                       | Explicit document/revision interface over existing payload                       | Medium; avoid schema rewrite               | Legacy V1/V2/V3 round trips and editor serialization                            |
| Command engine                          | `apps/cms/builder/builder-interaction.ts`, `grapes-editor.tsx`, `builder-shell.tsx`                                                      | Imperative editor methods and one shared move helper                      | Commands are the single mutation entry for UI surfaces                           | Medium/high; history semantics can regress | insert/delete/move/reparent/duplicate/property/style + undo/redo                |
| Registry parity                         | `packages/contracts/src/index.ts`, `builder-adapter.ts`, `apps/renderer/app/renderer.tsx`, extension registries                          | Builder and renderer each maintain parts of node knowledge                | Shared typed definitions and explicit renderer fallback                          | Medium; extensions are versioned           | Each supported node builder→save→preview→publish→public                         |
| Atomic version persistence              | `apps/api/src/domain/page.service.ts`, page/version schemas, `versioning.ts`                                                             | Read latest, compare, create version, save pointer                        | Transaction/CAS with normalized conflict and consistent side effects             | High; Mongo deployment/test setup matters  | Concurrent writers, duplicate index, injected failure, pointer consistency      |
| Overlay accessibility                   | `apps/cms/app/ui/surfaces.tsx`, `system.css`                                                                                             | Initial focus, Escape, restoration, body lock and Tab containment         | Nested/empty-surface coverage and complete dialog semantics                      | Low/medium; keyboard behavior changes      | Tab/Shift+Tab, Escape, restore focus, screen-reader labels                      |
| CMS screen extraction                   | `apps/cms/app/cms-dashboard.tsx`, shared UI files                                                                                        | One component owns all navigation/data/forms                              | Resource-level owners with explicit loading/error/empty state                    | Medium; avoid behavior drift               | Existing E2E per resource plus request-count tests                              |
| Tenant hardening                        | `tenant-resolution.middleware.ts`, `tenant-resolver.ts`, `tenant-connection.manager.ts`, `tenant-model.registry.ts`, all tenant services | Context and proxies enforce routing by convention                         | Explicit scope entry, query boundary tests and cluster routing contract          | High/security-sensitive                    | Tenant A/B read/write, public host, preview, integrations, background scope     |

## R. Proposed execution order

```text
R0 audit (this document)
  │
  ├─ R1.0  save acknowledgement/mutation guard
  ├─ R1.1  extension discriminator + interaction regression
  ├─ R1.2  dashboard request identity + duplicate fetch cleanup
  ├─ R1.3  server revision/CAS/transaction hardening
  │
  ├─ R1.4  PageDocument adapter seam and command interface
  ├─ R1.5  component/property registry parity
  │
  ├─ R2    shared UI/accessibility/state patterns
  ├─ R3    builder layers/canvas/inspector UX
  ├─ R4    CMS resource screen consolidation
  ├─ R5    renderer parity/responsive regression gates
  └─ R6    tenant isolation and operational hardening
```

At every step:

1. Add or update a focused test before changing shared behavior.
2. Keep `PagePayload` versions backward compatible.
3. Run format, lint, typecheck, unit/integration tests and build through the supported
   Node/pnpm toolchain.
4. Run the relevant Playwright workflow and request-count regression.
5. Update architecture/UX docs when the actual source behavior changes.

Do not implement R7/R8 product differentiation during this recovery pass.

## Documentation discrepancies found

The source is ahead of several historical documents:

- `docs/architecture/data-flow.md` still describes page creation/loading/preview/
  publishing as not implemented, while the API, CMS and E2E suites implement them.
- The root `README.md` still frames Phase 6–9 as the current implementation and lists
  billing/RBAC/automation as deferred, while source and later phase docs contain
  Phase 10–14 functionality.
- UX docs describe a focus-contained overlay; `surfaces.tsx` now implements that
  behavior, with broader nested/empty-surface coverage still recommended.
- The recovery context describes a canonical PageDocument and schema-driven inspector
  as goals. The source now has the Model-A adapter envelope and shared registry-backed
  inspector metadata; standalone Editor Core and historical document migrations remain
  intentionally incremental.

These should be corrected incrementally alongside the corresponding code changes;
historical phase records should remain historical rather than being rewritten as if
they were current implementation notes.

## Audit handoff / verification

The current worktree preserves the pre-existing user changes and adds the bounded
recovery work listed below:

- guard builder save acknowledgements against newer local mutations and concurrent
  manual save attempts (`R0-01`);
- recognize `extension` in the common builder structural interaction discriminator,
  with a focused regression test (`R0-02`);
- remove the duplicate page refresh trigger when entering domain/SEO views (`R0-03`);
- ignore stale selected-page detail and submission-filter responses (`R0-04`, `R0-05`);
- trap Tab/Shift+Tab inside shared Modal/Drawer surfaces and verify both wrap
  directions in the CMS shell E2E flow;
- add the Model-A PageDocument envelope, shared component registry and editor command
  layer;
- add schema-driven builder inspector fields, layer search, responsive inheritance
  hints, reset, keyboard layer navigation and live preview postMessage transport;
- add shared `DataTable`, `PaginationControls`, `EmptyState`, `LoadingState` and
  `ErrorState` primitives, and migrate Audit and Users views to them;
- add registry-iterated renderer compatibility coverage and stable fallback markers;
- add server-side compare-and-set draft pointer advancement with conflict normalization.

The context-pack documents that failed the initial formatting gate were normalized as
part of this recovery update. With Node `v24.19.0` and Corepack pnpm `10.15.0`, the
format, lint, typecheck, unit/integration, build and full E2E gates pass across all five
workspaces. The full Playwright suite now covers 45 journeys, including responsive
editing, keyboard layer navigation, draft conflicts and the live-preview postMessage
stream.

The recovery remains incremental and preserves existing payload versions. Remaining
follow-ups are concurrent CAS/injected-failure coverage, dashboard decomposition,
resource-wide state migration and visual regression baselines; no speculative
payload schema rewrite was introduced.
