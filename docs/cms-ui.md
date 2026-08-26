# CMS UI language and information architecture

Phase 12.5 establishes the CMS shell as a workspace product. This document is the
small reference for future UI work; it does not change authorization or backend
ownership.

## Information architecture

The current company and workspace are always visible in the top bar. Company is a
read-only tenant context; it is never a selector. Workspace switching uses the
existing authenticated context endpoint through the authorized workspace list. A
user who cannot list contexts, or has only one workspace, sees a read-only context
label instead of an empty or misleading selector.

The sidebar is grouped by task and remains permission-aware:

- **Workspace**: Dashboard, Organization, Sites, Landing Pages, Assets, Templates,
  and Submissions.
- **Operations**: Integrations, Analytics, Domains, and SEO.
- **Management**: Billing & Usage, Users, Roles, and Audit Log.

The sidebar can collapse on larger screens. The preference is stored locally as a
UX preference only; it has no security or tenant meaning. At tablet/mobile widths it
becomes an off-canvas sheet with a backdrop, Escape handling, focus containment, and
body scroll lock. Selecting a destination closes the sheet.

Each screen uses a page heading with an eyebrow, title, and short description. The
top bar adds the user account summary and sign-out action. Page titles remain in the
content `PageHeading`; no slash separator, page label, notification count, or
technical `Authenticated` badge is rendered in the global header.

## Visual primitives

The primary primitives are CSS-backed and intentionally small:

- `panel`, `panel-heading`, `two-column`, `stack`, and `list-row` for layout;
- `button-primary`, `button-secondary`, `button-ghost`, and `button-danger` for
  action hierarchy;
- `status-badge` for semantic success, warning, pending, failure, disabled, and
  draft states;
- `table-shell` and `data-table` for dense operational data;
- `empty-state`, retryable alerts, skeleton loading blocks, and `aria-live` status
  messages for async states.

Spacing, colors, borders, radii, and shadows are represented by root CSS tokens in
`apps/cms/app/globals.css`. The existing dark theme remains the product theme, but
surface contrast and text hierarchy are now consistent across the shell.

## Screen conventions

- **Pages** shows name, slug, publication status, updated date, and a light search /
  status filter. Builder and publication actions remain permission-aware.
- **Users** separates search and status filtering from the list, with explicit
  **View details** and **Edit** actions. The detail/access panel shows profile,
  status, tenant roles, workspace access, and role assignment controls. Passwords
  and tokens are never displayed.
- **Roles** shows role type, assignment count, and permission count in the list. A
  selected custom role opens an editor; system roles are explicitly read-only. The
  permission matrix is grouped by resource, scrollable, searchable, and supports
  selecting or clearing all visible permissions.
- **Audit Log** uses the operational columns Time, Actor, Action, Workspace,
  Resource, and Result, plus action/resource filters. Each event can expand to show
  request metadata without dumping the full payload in the table.
- **Submissions** keeps the actual submission fields and source metadata, with a
  right-side detail drawer on desktop and a bottom sheet on mobile.
- **Billing & Usage** is read-only. The plan, subscription state, period, entitlement,
  usage bars, enforcement mode, and near-limit warning are shown together.
- **Builder** keeps the existing PagePayload, save, conflict, layer drag/drop, and
  inspector behavior. The refresh is presentation-only: stronger panel hierarchy,
  visible drag-handle focus, clear save state, and responsive stacking.

## Accessibility and responsive behavior

Controls have visible labels or accessible names, active navigation exposes
`aria-current`, selected role buttons expose `aria-pressed`, audit details use native
`details`, and progress bars expose their value. Focus-visible outlines use the
primary accent. Reduced-motion users do not receive shimmer or transition motion.

The shell is checked at 1920, 1440, 1280, 1024, 768, and 390px widths. At smaller
widths the sidebar becomes off-canvas, context controls, forms, two-column panels,
and builder panels recompose. Dense
tables use an internal scroll region rather than causing page-wide horizontal
overflow. The builder canvas retains a usable minimum working area when necessary.

## Data and request boundaries

The refresh is client-side presentation work. It does not change the Master DB,
Tenant DB, resolver/context, authentication, RBAC decisions, billing/quota rules,
audit persistence, renderer, publishing, or PagePayload contracts. Existing
permission gates remain the source of truth. No polling or auto-save was introduced;
loading and retry controls reuse the existing request functions.

## Before / after inventory

| Area           | Before                                                  | After                                                                          |
| -------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Shell          | One long peer navigation list                           | Grouped, permission-aware navigation with collapse preference                  |
| Context        | Company and workspace selectors mixed with page context | Read-only Company + switchable Workspace; page title stays in content          |
| Loading/errors | Full-page text and passive inline errors                | Skeleton states and actionable retry states                                    |
| Status         | Mixed text pills                                        | Semantic `StatusBadge` tones and progress semantics                            |
| Pages          | Inventory list without search or updated date           | Search, status filter, updated date, and clearer builder action                |
| Roles          | Permission dump and prompt rename                       | Compact role summary, dedicated custom-role editor, grouped permission matrix  |
| Audit          | Expandable list rows                                    | Stable operational table with per-event details                                |
| Billing        | Basic cards                                             | Read-only plan context, status, usage progress, and quota warning              |
| Builder        | Strong behavior but dense presentation                  | Clearer layer/inspector hierarchy and drag-handle focus treatment              |
| Responsive     | Desktop-first breakpoints                               | Tablet/mobile off-canvas shell, drawer behavior, and tested overflow ownership |
