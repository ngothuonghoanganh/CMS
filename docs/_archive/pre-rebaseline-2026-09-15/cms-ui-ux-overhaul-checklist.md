# CMS UI/UX overhaul checklist

This checklist is the working inventory for the CMS routing and experience overhaul. The
route inventory is based on the source under `apps/cms/app` and `apps/cms/builder`, not on
generated `.next` output.

## Audit inventory

- Baseline route files: 5 (root, login, page builder, layout builder, template builder).
- Baseline view screens: 20, drawer usages: 7, modal usages: 9, table usages: 3, and
  forms: 24.
- Baseline routing problem: 19 non-builder screens were selected with `view` state inside
  the former `cms-dashboard.tsx`; sidebar navigation used buttons instead of route navigation.
- Baseline interaction problems: Sites and Pages opened a drawer on module entry; page and
  collection selections were local state even when they represented a screen.
- Post-migration route inventory: 51 workspace route files, including 48 route pages, plus
  route-level loading and error boundaries. All 20 audited CMS view modules have a route
  entry point.

## Target route inventory

| Current screen      | Current implementation                 | Problem                            | Target route                                                               | Interaction                           |
| ------------------- | -------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------- | ------------------------------------- |
| Dashboard           | Root route + local `view`              | View state is not shareable        | `/workspaces/:workspaceId`                                                 | Page                                  |
| Sites               | Dashboard branch + local drawer        | No dedicated route                 | `/workspaces/:workspaceId/sites`                                           | Page; explicit create/edit drawer     |
| Site                | Selected site state                    | No resource URL                    | `/workspaces/:workspaceId/sites/:siteId`                                   | Page                                  |
| Pages               | Dashboard branch + local selection     | Monolithic; selection opens drawer | `/workspaces/:workspaceId/sites/:siteId/pages`                             | Page                                  |
| Create page         | Page drawer                            | Route cannot be shared             | `/workspaces/:workspaceId/sites/:siteId/pages/new`                         | Explicit create drawer                |
| Page detail         | Page selection + detail panel          | No deep link                       | `/workspaces/:workspaceId/sites/:siteId/pages/:pageId`                     | Page                                  |
| Edit page           | Page drawer                            | Edit state is local                | `/workspaces/:workspaceId/sites/:siteId/pages/:pageId/edit`                | Explicit edit drawer                  |
| Page builder        | Existing dedicated route               | Keep workspace route               | `/workspaces/:workspaceId/sites/:siteId/pages/:pageId/builder`             | Full-page workspace                   |
| Page SEO            | Dashboard branch + selected page       | No deep link                       | `/workspaces/:workspaceId/sites/:siteId/pages/:pageId/seo`                 | Page                                  |
| Page workflows      | Dashboard branch + selected page       | No deep link                       | `/workspaces/:workspaceId/sites/:siteId/pages/:pageId/workflows`           | Page                                  |
| Collections         | Dashboard branch + local collection    | Schema/entries mixed               | `/workspaces/:workspaceId/sites/:siteId/collections`                       | Page                                  |
| Collection entries  | Collection panel                       | Entry context is local             | `/workspaces/:workspaceId/sites/:siteId/collections/:collectionId/entries` | Page; explicit entry drawer           |
| Collection schema   | Route-backed schema editor             | Needs a long-lived editing surface | `/workspaces/:workspaceId/sites/:siteId/collections/:collectionId/schema`  | Full-page inline editor               |
| Assets              | Dashboard branch + always-visible form | Create UI consumes list space      | `/workspaces/:workspaceId/assets`                                          | Page; explicit create drawer          |
| Templates           | Dashboard branch + always-visible form | Create/edit mixed into inventory   | `/workspaces/:workspaceId/templates`                                       | Page; explicit create/edit surface    |
| Forms / submissions | Dashboard branch + detail drawer       | Submission detail is explicit      | `/workspaces/:workspaceId/submissions`                                     | Page; detail drawer on row intent     |
| Integrations        | Dashboard branch                       | No dedicated route                 | `/workspaces/:workspaceId/integrations`                                    | Page; explicit focused modal          |
| Analytics           | Dashboard branch                       | No dedicated route                 | `/workspaces/:workspaceId/analytics`                                       | Full page                             |
| Domains             | Dashboard branch + modals              | No dedicated route                 | `/workspaces/:workspaceId/domains`                                         | Page; focused modal                   |
| Navigation          | Dashboard branch                       | No dedicated route                 | `/workspaces/:workspaceId/sites/:siteId/navigation`                        | Page                                  |
| Design system       | Dashboard branch                       | No dedicated route                 | `/workspaces/:workspaceId/sites/:siteId/design-system`                     | Page                                  |
| Billing             | Dashboard branch                       | No dedicated route                 | `/workspaces/:workspaceId/billing`                                         | Page                                  |
| Users               | Dashboard branch + drawer/modal        | No dedicated route                 | `/workspaces/:workspaceId/users`                                           | Page; explicit detail/create surfaces |
| Roles               | Dashboard branch + modals              | No dedicated route                 | `/workspaces/:workspaceId/roles`                                           | Page; focused modals                  |
| Audit log           | Dashboard branch                       | No dedicated route                 | `/workspaces/:workspaceId/audit`                                           | Page                                  |
| Extensions          | Dashboard branch + layout drawer       | No dedicated route                 | `/workspaces/:workspaceId/extensions`                                      | Page; explicit layout drawer          |
| Workflows           | Dashboard branch                       | No dedicated route                 | `/workspaces/:workspaceId/workflows`                                       | Page                                  |
| Organization        | Dashboard branch                       | No dedicated route                 | `/workspaces/:workspaceId/organization`                                    | Page                                  |

## Cross-route acceptance

- [x] Every major screen has a meaningful URL.
- [x] Direct navigation and browser refresh work for the implemented target routes; the
      production build enumerates all route entries and browser smoke covers the critical flows.
- [x] Browser back/forward returns to the previous meaningful screen in the page and
      collection journeys.
- [x] Active navigation is derived from the routed view, including nested detail routes;
      dedicated builder routes intentionally use their own full-screen workspace shell.
- [x] The old `view`/`activeView` navigation architecture is removed. The root route only
      retains a compatibility redirect for old `/?view=` bookmarks.
- [x] The former CMS dashboard and route adapter are deleted; child routes render feature
      modules directly inside the shared shell. See `cms-route-ownership.md`.
- [x] Route resource IDs are canonical; local state caches data and temporary form drafts.

## CMS shell and navigation

- [x] One clear workspace context in the header.
- [x] Navigation groups contain only implemented modules.
- [x] Navigation uses router navigation, not local screen state.
- [x] Mobile navigation can open, close, and restore focus.
- [x] Sidebar collapse state remains a local preference only.
- [x] Shared shell has a route-level loading state and actionable error state.

## Pages

### Routing

- [x] Dedicated list, new, detail, edit, SEO, workflow, and builder routes.
- [x] Page row opens detail route; it does not open a drawer implicitly.
- [x] Builder is a full-page workspace.

### Layout and list

- [x] One page header and one primary action.
- [x] Search/status controls stay in one toolbar.
- [x] Sitemap has loading, empty, and no-results states.
- [x] Row actions use a compact, predictable pattern.
- [x] Long paths are constrained without horizontal page overflow.

### Drawers and forms

- [x] Drawer is closed on `/pages` and `/pages/:pageId` by default.
- [x] New/edit drawers open only after an explicit action or matching `/new`/`/edit` route.
- [x] Metadata fields have labels, validation, and a visible sticky footer.
- [x] Mobile drawer uses the viewport safely.

## Sites

- [x] Dedicated sites route.
- [x] Site create/edit drawer is closed by default.
- [x] Pagination and empty state are actionable.
- [x] Destructive actions are not permanently prominent.

## Collections

- [x] List, collection detail, entries, and schema have meaningful routes. No separate
      settings screen exists in the audited domain; collection settings remain part of schema
      ownership.
- [x] Collection selection is route-backed.
- [x] Entry create/edit is an explicit drawer action.
- [x] Schema editor is a route-backed full-page inline editor, not an overlay.
- [x] Entry search, status, sort, pagination, empty, loading, and error states are clear.

## Assets and templates

- [x] List pages use a standard page header and toolbar.
- [x] Create forms do not permanently occupy the main list column.
- [x] Upload/create action is explicit and mobile-safe.
- [x] Inventory rows keep only the primary action visible; destructive actions are grouped.

## Engagement and operations

- [x] Submissions list has search, status filter, pagination, empty, and error states.
- [x] Submission detail drawer opens only from an explicit row click.
- [x] Integrations and domains keep focused forms in modals.
- [x] Analytics has a stable full-page layout and responsive tables.
- [x] SEO and workflows are deep-linkable for the selected page.

## Management

- [x] Users, roles, audit, billing, extensions, and organization have dedicated routes.
- [x] Create/edit/detail surfaces are explicit and appropriately sized.
- [x] Permission-gated actions remain enforced by the API and are reflected in the UI.

## Shared UI and accessibility

- [x] `PageHeader`, `ResourceToolbar`, `DataTable`, `EmptyState`, and surface primitives are reused.
- [x] Labels are not replaced by placeholders.
- [x] Buttons and links are semantic controls.
- [x] Dialog/drawer Escape, focus trap, focus return, and backdrop close work.
- [x] Disabled and pending states are visible and prevent duplicate submissions.
- [x] Desktop, tablet, and mobile layouts have no accidental horizontal page scroll in the
      audited CMS flows.

## Validation record

- [x] `pnpm format:check` (after the final formatting fix)
- [x] `pnpm lint` (root turbo: 4/4 tasks successful)
- [x] `pnpm typecheck` (root turbo: 5/5 tasks successful)
- [x] `pnpm test` (root turbo: 5/5 tasks successful; CMS 20 files, 111 tests)
- [x] `pnpm build` (root turbo: 5/5 tasks successful; CMS route tree compiled)
- [ ] `pnpm exec playwright test` (executed: 79 passed, 2 failures in pre-existing
      billing/parity fixtures; route smoke, schema smoke, and CMS regression all pass)
- [x] Browser smoke checked at desktop, tablet, and mobile widths in the existing CMS E2E
      suite; critical route smoke also covers the responsive shell.
