# CMS Route Ownership Checklist

## Global shell

- [x] `CmsShell`, mounted by the workspace layout, owns auth/session, workspace context,
      permissions, header, sidebar, workspace switching, and global shell errors.
- [x] No feature CRUD, feature fetch bootstrap, selected resource, feature drawer, or
      feature form lives in the shell.
- [x] Active navigation derives from pathname.
- [x] Navigation uses canonical router links.
- [x] No feature route imports the legacy CMS dashboard or route adapter.

## Module audit

For every module below:

- [x] Dedicated route page renders the module directly.
- [x] Feature data is loaded by the module.
- [x] Feature-specific view/UI is colocated.
- [x] Save, cancel, and detail actions stay within the feature route tree.
- [x] Direct load and refresh do not require visiting the workspace root first.
- [x] No feature import points at the removed CMS dashboard.

Covered modules:

- [x] Overview
- [x] Sites
- [x] Pages and page builder
- [x] Collections, schema, entries, and entry editing
- [x] Assets
- [x] Templates and template builder
- [x] Navigation
- [x] Design system
- [x] SEO
- [x] Integrations
- [x] Analytics
- [x] Billing
- [x] Domains
- [x] Users
- [x] Roles
- [x] Organization
- [x] Audit log
- [x] Submissions/leads
- [x] Extensions/layouts
- [x] Workflows

## Search gates

- [x] No `CmsDashboard` or `CmsRoutePage` references remain in the application.
- [x] No `activeView`, `currentView`, `selectedModule`, or feature render switch remains.
- [x] New UI does not generate `/?view=...` URLs.
- [x] No feature save/cancel path redirects to a generic CMS root.
- [x] Page Builder Leave returns to the canonical page detail route.
- [x] Layout and Template Builder leave paths return to canonical owners.
- [x] Root `/` and login redirect directly to canonical workspace routes.
- [x] Page, Layout, and Template Builders bypass `CmsShell`.
- [x] Route helpers only build URLs; they do not render or own state.

## Validation

- [x] CMS lint
- [x] CMS typecheck
- [x] CMS route smoke tests
- [x] Root `pnpm format:check`
- [x] Root `pnpm lint`
- [x] Root `pnpm typecheck`
- [x] Root `pnpm test`
- [x] Root `pnpm build`
- [x] Full Playwright suite executed: 87/87 passed, including tenancy and
      picker coverage.

The prior full-suite failure classifications and closure actions are listed in
`docs/phase-20-completion-audit.md`.
