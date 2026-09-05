# CMS Route Ownership Checklist

## Global shell

- [x] `CmsShell` owns auth/session, workspace context, permissions, header, sidebar,
      workspace switching, and global shell errors.
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
- [x] Full Playwright suite executed: 79/81 passed; two existing fixture failures remain
      in billing control-plane login and the missing `parity-extension` fixture.

The two remaining full-suite failures are outside the CMS route ownership change and are
listed explicitly in the task handoff.
