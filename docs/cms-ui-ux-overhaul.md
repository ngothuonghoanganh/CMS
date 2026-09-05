# CMS UI/UX overhaul

## Goals

The CMS is a no-code website and landing-page workspace. Its URL structure should describe
the user's task, while overlays should be reserved for short, intentional actions.

## Previous problems

The root page rendered `CmsDashboard`, which owned every module and changed screens with a
local `view` value. Navigation buttons did not update the URL. `selectedSiteId` and
`selectedPageId` were also local identities, and entry into Sites or Pages triggered a
drawer-opening effect. This made refresh, deep links, and browser history unreliable.

## Routing architecture

The implemented architecture is workspace-aware App Router navigation:

```text
/                                  dashboard for the current workspace
/login
/workspaces/:workspaceId
├── /sites
│   ├── /new
│   └── /:siteId
│       ├── /edit
│       ├── /pages
│       │   ├── /new
│       │   └── /:pageId
│       │       ├── /edit
│       │       ├── /seo
│       │       ├── /workflows
│       │       └── /builder
│       ├── /collections
│       │   ├── /new
│       │   └── /:collectionId
│       │       ├── /entries
│       │       │   ├── /new
│       │       │   └── /:entryId/edit
│       │       └── /schema
│       ├── /navigation
│       └── /design-system
├── /assets
│   └── /new
├── /templates
│   ├── /new
│   └── /:templateId
│       └── /edit
├── /submissions
├── /integrations
├── /analytics
├── /domains
├── /billing
├── /users
├── /roles
├── /audit
├── /extensions
├── /workflows
└── /organization
```

Page and template builders remain dedicated full-screen routes beneath their owning
resource. The root route continues to accept the pre-existing `/?view=...` shape only as a
one-time compatibility redirect; it is not used as navigation state by the CMS.

The API/domain contracts remain unchanged. The workspace ID in the URL identifies the
current CMS context; resource IDs identify the screen's canonical resource. Search, filters,
sort, pagination, and deep-linkable tabs should use URL parameters as they are extracted from
the existing local screens.

## Page vs drawer vs modal

- Full-page routes: builders, analytics, schema editing, complex entry editing, and settings
  with multiple sections.
- Drawers: short create/edit forms and lightweight detail views when list context helps.
- Modals: confirmation, destructive actions, rename, and other focused decisions.

Every overlay is closed by default. It may open from a clear user action or from a route whose
purpose explicitly represents that action, such as `/pages/new` or `/pages/:pageId/edit`.

## State ownership

Pathname and route params own the current module and resource identity. Search/filter/paging
state belongs in URL parameters when preserving it across back/forward is useful. Popovers,
temporary form drafts, focus state, and animation state remain local. Cached API data can be
local to the active screen, but it must not compete with the URL for identity.

## Shell and responsive rules

The shell keeps the workspace switcher, responsive sidebar, and account controls consistent.
The content area must remain `min-width: 0`; data grids may scroll inside their own bounded
container, but the page itself must not gain accidental horizontal scroll. At mobile widths,
toolbars wrap, forms become one column, and drawers use the available viewport.

## Audit status

The complete per-module checklist is maintained in
[`cms-ui-ux-overhaul-checklist.md`](./cms-ui-ux-overhaul-checklist.md). It is updated as
routes and interactions are implemented and validated. The audited baseline covered 20 CMS
view modules, 7 drawers, 9 modals, 3 tables, and 24 forms. The migration now exposes 48
workspace route pages across the same module set, with route-level loading and error states.

The former `CmsDashboard` controller and route adapter have been removed. Each App Router
page now renders its feature module directly inside `CmsShell`; routed IDs remain canonical
and module surfaces are closed unless the URL or an explicit action requests them. See
[`cms-route-ownership.md`](./cms-route-ownership.md) for the ownership and dependency map.

## Shared UX patterns

- `PageHeader`, `ResourceToolbar`, `DataTable`, `EmptyState`, `LoadingState`, and
  `ErrorState` provide the common page/list vocabulary.
- Row actions keep the primary path visible and group destructive or secondary actions in a
  compact menu where appropriate.
- Drawer and modal primitives own Escape handling, focus return, focus containment, backdrop
  close, pending states, and mobile sizing.
- Collection schema editing is a route-backed inline full-page surface. Short metadata and
  entry tasks remain drawers so the list context is preserved.

## Tests

The routing smoke suite covers deep-linking, clean module entry, explicit create actions,
route-backed drawers, cancellation, schema full-page behavior, and browser back behavior. The
existing CMS regression suite covers authentication, responsive shell behavior, tenancy,
SEO/workflows, collection entries, and builder interactions. The targeted route/regression
checks are green; the final full 81-test run finished with 79 passes and two pre-existing
fixture failures: billing control-plane login setup and the missing `parity-extension` fixture.

## Remaining issues

- No known blocking CMS UI/UX issues remain in the audited scope.
- Non-blocking compatibility: legacy `/?view=...` bookmarks are redirected by
  `apps/cms/app/page.tsx`; remove this redirect only after downstream links and external
  automation have migrated to workspace routes.
- Non-blocking follow-up: several pre-existing list filters/search fields remain local UI
  state. Resource identity is route-backed today; promote list filters to search parameters
  when those views need shareable filtered URLs.
