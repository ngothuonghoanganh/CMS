# CMS layout architecture

This document records the layout rules applied during the pre-Phase 14 cleanup.
The CMS is a list-centered product: each route has one primary task, while
creation, editing, and inspection happen in a focused surface.

## Rules

- A page header owns the route title, short context, and one primary action.
- A resource toolbar owns search, filters, count, and pagination controls.
- Lists and tables are the default content surface. Long values truncate in rows;
  the surrounding panel or table owns horizontal scrolling when a column cannot
  collapse.
- Create and edit flows use a modal. Use `sm` for confirmations, `md` for short
  forms, `lg` for multi-section forms, and `fullscreen` for builders or dense
  workspaces.
- Read-only or multi-section inspection uses a drawer. The drawer header stays
  visible, its body scrolls locally, and Escape/backdrop/Close all dismiss it.
- Advanced or rarely used controls belong in an accordion, tab, or a nested
  surface. They should not make the primary list taller than the task requires.
- Every surface owns its header and footer actions. Footer actions remain visible
  while the body scrolls.
- Responsive rules are component-level: flex/grid children have `min-width: 0`,
  long tokens wrap, and mobile controls stack without widening the document.

## Surface inventory

| Route                 | Primary surface                   | Secondary surface                              |
| --------------------- | --------------------------------- | ---------------------------------------------- |
| Overview              | summary and recent-resource cards | route shortcuts                                |
| Sites                 | site list                         | existing create/edit form; migration candidate |
| Pages                 | filtered page list                | metadata form; dedicated Builder route         |
| Assets / Templates    | resource lists                    | existing metadata forms; migration candidates  |
| Submissions           | submissions list                  | submission detail drawer                       |
| Users                 | searchable users list             | create modal; user detail drawer               |
| Roles                 | roles list                        | create/edit `lg` modal; assignment modal       |
| Domains               | configured-domain list            | add/edit settings modal                        |
| Integrations          | integration list and delivery log | create/edit `lg` modal                         |
| SEO                   | page-scoped settings              | dedicated configuration route                  |
| Workflows / Analytics | dedicated workspace               | tabs or step surfaces where needed             |
| Audit Log             | event list                        | event detail drawer                            |
| Builder               | dedicated editor workspace        | grouped/collapsible inspector sections         |

The first cleanup pass focuses on the shared surfaces and the high-risk operational
routes (Users, Roles, Domains, Integrations, and Submissions). Sites, Pages,
Assets, Templates, and Organization still contain task-specific forms because they
also coordinate selection, version history, publishing, or context switching. They
are documented as list-first migration candidates rather than being silently treated
as complete.

## Shared implementation

`apps/cms/app/ui/surfaces.tsx` provides `PageHeader`, `ResourceToolbar`,
`Modal`, and `Drawer`. The overlay primitive handles body-scroll locking,
Escape dismissal, backdrop dismissal, and focus restoration. Surface bodies use
local overflow, so a long permission list, delivery log, or detail panel does not
push the page shell horizontally.

`apps/cms/app/ui/system.css` contains the surface tokens and responsive rules.
The global list-row hardening in `apps/cms/app/globals.css` prevents verification
tokens, error messages, and long URLs from creating mobile overflow.

## MCP verification notes

The running CMS was inspected with Playwright MCP at desktop (1440px) and mobile
(390px) widths. Roles, Domains, Users, and the shared modal/drawer states were
opened through the real navigation. The mobile Domains view initially exposed a
long DNS token as a 1034px row; the list-row wrapping fix reduced document width
to the 390px viewport while preserving local surface scrolling.
