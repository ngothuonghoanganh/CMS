# CMS UI audit — Phase 12.5 baseline

## Scope

This audit covers the existing CMS shell, tenant/workspace context, management
views, content views and visual builder before the UX refresh. The audit was based
on the current source plus the authenticated CMS bootstrap Playwright scenario.
The existing API, tenant isolation, RBAC, billing, audit and PagePayload behavior
are intentionally out of scope for redesign.

## Findings

| Area           | Before                                                                                                     | Risk / usability impact                                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Navigation     | All destinations were one long list of peer buttons.                                                       | Users had to scan unrelated content, operations and tenant management together.                                                  |
| Context        | Company and workspace selectors were stacked under a generic `Organization` label.                         | The active tenant/workspace was easy to miss and the shell did not explain scope.                                                |
| Shell          | Sidebar, topbar and page content used different spacing and surface treatments.                            | The application felt like several pages assembled together rather than one SaaS product.                                         |
| Page headers   | Most pages had a heading, but eyebrow, title, description and actions were not consistently aligned.       | Primary next actions were not predictable.                                                                                       |
| Lists / tables | Pages, users, audit and settings views mostly used generic list rows.                                      | Dense operational data was harder to scan and row actions competed with the content.                                             |
| Status         | `pill` was used for many unrelated statuses without semantic color or consistent wording.                  | Active, disabled, draft, published and failure states were not differentiated enough.                                            |
| Loading        | Dashboard bootstrap and billing used large whole-page loading states.                                      | Layout could flicker and users lost context while data loaded.                                                                   |
| Errors         | Global errors were plain alerts without a retry action; individual views varied.                           | Recovery was unclear and raw API messages were too prominent.                                                                    |
| Users / Roles  | Users were usable but access details were visually dense; Roles listed every permission on the role index. | Management screens became noisy as the tenant grew.                                                                              |
| Audit          | Audit entries were expandable list rows.                                                                   | Useful history was present but not table-like enough for time/actor/action scanning.                                             |
| Billing        | Usage cards existed but plan/usage hierarchy was weak.                                                     | Current plan and quota state were not immediately legible.                                                                       |
| Pages          | Page inventory had status and builder actions but no lightweight search/filter.                            | Finding a page became slow with a larger site.                                                                                   |
| Builder        | Core layers drag/drop, selected state, inspector groups and save/conflict state already existed.           | Presentation could better communicate canvas space, panel boundaries, drop targets and save state; behavior should be preserved. |
| Responsive     | Mobile CSS stacked the shell late and several controls could wrap awkwardly at laptop widths.              | 1024px and tablet use needed a deliberate pass.                                                                                  |

## Refresh decisions

- Keep the current dark visual identity, but consolidate colors, surfaces, spacing,
  radii, focus rings and status semantics into CSS tokens.
- Group navigation into Workspace, Operations and Management while keeping existing
  permission checks as the source of truth.
- Keep the current client-side view architecture and API routes. Add only UI state
  and presentation primitives; no backend or PagePayload changes are needed.
- Prefer compact data rows with a clear primary target and restrained secondary
  actions. Keep internal horizontal scrolling inside tables where necessary.
- Use skeletons and actionable retry states for shell-level loading/error handling.
- Treat the builder as a focused editor: retain explicit drag handles and current
  validation, improve panel/canvas hierarchy and make save/publish feedback clearer.

## Deliberate non-goals

No global search, fake notifications, checkout, media library, new invitation flow,
automatic saving, permission model changes, tenant authority in localStorage or
PagePayload changes are introduced by this phase.

## Header and responsive hardening audit — Phase 12.5 follow-up

The previous refresh exposed four shell issues that needed a focused follow-up:

- Company was still rendered as a tenant selector in the global header, even though
  the authenticated tenant is server-resolved and Company is context only.
- A slash and the current view label mixed context selectors with page navigation.
- `Authenticated` was a technical debug state rather than an account affordance.
- At tablet/mobile widths the sidebar became an in-flow navigation grid instead of an
  off-canvas navigation surface. This made the header and content compete for width.

The responsive hotspots audited before implementation were fixed sidebar widths,
header flex children without an explicit small-screen composition, table minimum
widths, nested form grids, detail panels, and the builder's three-panel minimum
working area. The ordinary CMS shell now owns the viewport-sized mobile navigation;
tables and the builder retain their own intentional internal scroll ownership.

## Follow-up design plan and implementation

- `CurrentCompany` is a non-interactive, truncated read-only display.
- `WorkspaceSwitcher` is the only global context control. It uses an accessible
  popover with optional search when the authorized workspace list is large and a
  clear non-interactive display when there is only one workspace.
- The global header is compact and contains Company, Workspace, and account/sign-out
  information only. Page title/context remains in `PageHeading`.
- Desktop keeps the existing menu items and collapse preference. Tablet/mobile uses
  a focusable off-canvas sheet with backdrop, Escape handling, and body scroll lock;
  navigation closes after a destination is selected.
- Submissions now use a responsive detail drawer: right-side on desktop and a
  bottom/full-width sheet on mobile. Users use a responsive data table with primary
  identity columns retained on mobile, plus explicit View details/Edit actions and an
  inline profile/access panel.
- Shared control heights, table wrappers, drawer surfaces, and page toolbar styles
  are defined in the existing CSS token layer; no second UI framework was added.

The visual direction was informed by restrained dark SaaS patterns: elevated shell
surfaces, compact header groups, clear active navigation, and internal table scroll.
The [shadcn Sidebar reference](https://ui.shadcn.com/docs/components/base/sidebar)
was used as a structural reference for desktop collapse versus mobile Sheet behavior;
Pinterest and other dashboard galleries were used only for density and hierarchy
inspiration, not as copied visual assets or components.
