# CMS Route Ownership

## Problem

The first multi-route pass added App Router entries, but every entry rendered the same
`CmsDashboard`. That component fetched unrelated resources, owned every mutation, and
selected the screen from a route descriptor. The URL changed, but ownership did not.

## New architecture

```text
App Router workspace layout
  -> CmsShell (auth, workspace context, permissions, global navigation)
  -> App Router feature page (feature data and mutations)
  -> feature view/components
  -> shared UI and API client
```

`CmsShell` is mounted once by `app/workspaces/[workspaceId]/layout.tsx`. It does not
render feature content and does not own selected pages, collections, assets, forms,
drawers, or feature CRUD. Navigation is made of `Link` elements and the active item is
derived from the current pathname. Workspace and permission context are the only
feature-independent data loaded by the shell.

The old `cms-dashboard.tsx` and `workspaces/[workspaceId]/route-page.tsx` adapters were
removed. The root `/?view=...` compatibility path is one-way: it resolves an old
bookmark to a canonical route and no new UI creates that URL. An explicit
`isStandaloneWorkspaceRoute` boundary in the workspace layout leaves page,
layout, and template builders outside `CmsShell`, so builders own their full
viewport without a nested management shell.

## Route map

All routes are rooted at `/workspaces/:workspaceId`:

```text
/workspaces/:workspaceId
├── analytics
├── assets
│   └── new
│   └── :assetId
├── audit
├── billing
├── collections
├── design-system
├── domains
├── extensions
├── integrations
├── navigation
├── organization
├── pages
├── roles
├── seo
├── sites
│   ├── new
│   └── :siteId
│       ├── edit
│       ├── pages
│       │   ├── new
│       │   └── :pageId
│       │       ├── edit
│       │       ├── builder
│       │       ├── seo
│       │       └── workflows
│       ├── collections
│       │   ├── new
│       │   └── :collectionId
│       │       ├── schema
│       │       └── entries
│       │           ├── new
│       │           ├── :entryId
│       │           └── :entryId/edit
│       ├── navigation
│       ├── design-system
│       ├── seo
│       ├── workflows
│       ├── layouts/:kind/:layoutId/builder
│       └── templates/:templateId/builder
├── submissions
├── templates
│   ├── new
│   └── :templateId
│       └── edit
├── users
└── workflows
```

The page, layout, and template builder shells remain a separate builder subsystem and are
rendered directly by their builder routes. Builder leave actions use canonical page,
layout-owner, or template paths; they do not return to `/`.

## Feature ownership

Feature route composition and data ownership now live in:

| Feature              | Owner                             | Feature-specific view/components                             |
| -------------------- | --------------------------------- | ------------------------------------------------------------ |
| Overview             | `app/overview`                    | `overview-page.tsx`                                          |
| Sites                | `app/sites`                       | `sites-page.tsx`                                             |
| Pages                | `app/pages`                       | `pages-page.tsx`, `pages-view.tsx`, `page-layout-editor.tsx` |
| Collections          | `app/collections`                 | `collections-page.tsx`, `collections-view.tsx`               |
| Assets               | `app/assets`                      | `assets-page.tsx`, route-driven asset detail                 |
| Templates            | `app/templates`                   | `templates-page.tsx`                                         |
| Navigation           | `app/navigation`                  | navigation page/view/tree                                    |
| SEO                  | `app/seo`                         | SEO page/view                                                |
| Design system        | `app/design-system`               | design-system page/view                                      |
| Users/Roles          | `app/users`, `app/roles`          | page/view pairs                                              |
| Organization         | `app/organization`                | organization page/view                                       |
| Domains              | `app/domains`                     | domain page/view                                             |
| Integrations         | `app/integrations`                | integration view                                             |
| Analytics/Billing    | `app/analytics`, `app/billing`    | view owned by each feature                                   |
| Audit/Submissions    | `app/audit`, `app/submissions`    | page/view or page-local UI                                   |
| Extensions/Workflows | `app/extensions`, `app/workflows` | page/view pairs                                              |
| Builders             | `app/builder`                     | builder shells and builder-local UI                          |

The generic UI surfaces, API client, contracts, status badge, and application header
remain shared because they are not resource-specific.

## Dependency direction

```text
route page -> feature module -> shared UI / lib / contracts
```

Feature modules may consume `CmsShell` for the current workspace and capabilities. The
shell never imports a feature page. Feature resources are loaded by the route's feature
module from route params and shell context; resource IDs are not stored as global CMS
selection state.

## Component colocation rules

- A component used by one feature stays inside that feature directory.
- A component is shared only when at least two features use it and its props/business
  logic are generic.
- Feature hooks, form state, API helpers, and types belong beside their owner. Backend
  contracts are imported from `@payload/contracts` instead of duplicated.
- Route params are the source of truth for site, page, collection, entry, and template
  detail routes. Closing or saving returns to the owning feature route.
- Drawers are opened by explicit create/edit routes or actions; list navigation does not
  infer selection from the old dashboard state.

## Legacy cleanup

- Removed the giant CMS controller and route adapter.
- Removed the dashboard's global resource bootstrap and feature CRUD handlers.
- Removed feature views from the app root and colocated them with their feature.
- Replaced feature route rendering with direct feature page rendering.
- Kept only one-way legacy query compatibility in the root page for existing bookmarks.

## Testing

`tests/e2e/cms-routing.spec.ts` covers direct loading of every major workspace module,
canonical Pages/detail/edit routes, explicit create drawers, refresh, and browser history.
`tests/e2e/cms-routing-root.spec.ts` covers root/login canonical redirects, and the
builder E2E suites assert that standalone builders do not render the CMS sidebar or
header. Feature tests continue to exercise publishing, collections, workflows,
integrations, SEO, domains, and builder flows. The ownership checklist records the
module-by-module audit requirements.
