# AI Context Implementation Audit

Date: 2026-08-27

This document maps every section in `docs/ai-context/docs/ai-context` to the
current source, verified behavior, and the next bounded upgrade. It is an
implementation audit, not a second product specification.

## Decision summary

The repository uses Model A for GrapesJS: GrapesJS owns the live mutable editor
tree, while the contracts package owns the versioned `PagePayload` and the
`PageDocument` adapter envelope. This is intentional and avoids introducing a
second editable tree until the current persistence path is measured to be
insufficient.

The highest-value remaining work is consolidation rather than new page types:

- centralize contract validation on the shared component registry;
- keep inspector and palette interactions schema-driven and reversible;
- make shared CMS states and data surfaces composable;
- generate registry/renderer compatibility coverage;
- keep tenant and revision boundaries observable and testable.

## 01 — Product and domain

| Context item              | Current source truth                                                                              | Upgrade/status                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Visual publishing product | CMS, Builder, API and Renderer routes exist                                                       | Implemented; core journey is covered by Playwright.                                                  |
| Platform operator         | Master/control-plane tenant services and platform roles exist                                     | Partial; operational observability and migration dashboard remain.                                   |
| Company administrator     | Tenant RBAC, users, roles, pages, forms, integrations and settings exist                          | Implemented for current scope; invitations/reset are intentionally deferred.                         |
| Designer/advanced editor  | Builder exposes structure, styles, responsive editing, minimap and preview                        | Partial; reusable sections, context menus, hide/lock and richer drop affordances remain.             |
| Content editor            | No explicit restricted builder mode                                                               | Planned P1; requires a permission/capability decision before hiding structural commands.             |
| Tenant/company            | Tenant DB topology and request context are implemented                                            | Implemented; migration status and operational diagnostics remain.                                    |
| Page/PageDocument         | Versioned payload plus `PageDocument` envelope                                                    | Implemented with legacy payload migration seam.                                                      |
| Component contract        | Shared registry contains defaults, slots, relationships, properties and migrations                | Implemented for current node set; per-node component versions and real migrations remain.            |
| Form/submission/lead      | Forms and submissions are first-class; lead is represented by submission/workflow domain behavior | Partial; the product distinction between submission and durable lead needs a future domain decision. |
| Integrations              | Tenant-scoped integrations, encrypted secrets and delivery records exist                          | Implemented for current providers; credential rotation UX remains.                                   |
| Renderer                  | Public and preview runtime consume validated page payloads                                        | Implemented; registry-generated compatibility tests and richer diagnostics are next.                 |
| Extensibility             | Extension, capability and workflow registries exist                                               | Implemented; new extensions should add registry entries instead of switch branches.                  |

## 02 — Current-state problem map

| Problem class               | Evidence after the recovery pass                                                                          | Upgrade/status                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Oversized CMS screens       | Feature route modules now own their resource data and views; shared shell owns only cross-cutting context | Improved; route ownership is documented in `docs/cms-route-ownership.md`.                |
| Dense inspector             | Shared property schema and grouped controls are used by Builder                                           | Improved; reset override action and schema-driven controls are now explicit.             |
| Duplicate editor state      | GrapesJS is documented as Model A; React stores selection/session state only                              | Improved; save snapshots use the live editor document.                                   |
| Drag/drop divergence        | Canvas and Layers call shared `moveNodeByIntent`                                                          | Implemented; virtualized large trees and context actions remain.                         |
| Builder/renderer drift      | Both consume `PAGE_COMPONENT_REGISTRY`; renderer dispatch remains a separate implementation map           | Improved; registry-iterated parity coverage now fails on an unsupported registered type. |
| API/refetch loops           | GET deduplication and request sequence guards exist; live preview uses events                             | Improved; every major view still needs explicit request-count assertions.                |
| Responsive CMS              | Shell/media queries and local table overflow exist                                                        | Partial; screenshot baselines and all route widths remain to be formalized.              |
| Design-system fragmentation | `fields.tsx`, `surfaces.tsx` and shared CSS exist, but many resource forms are native                     | Partial; migrate by resource, preserving business-flow behavior.                         |
| Dead/duplicate code         | No safe broad deletion was proven                                                                         | Open; continue with ownership-based extraction, not static-import deletion.              |
| Validation/indexes          | Contracts, API validation, tenant indexes and page-version uniqueness exist                               | Partial; injected failure and migration-index checks remain.                             |

## 03 — Target architecture

| Architectural requirement            | Current source truth                                                          | Upgrade/status                                                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Contracts/domain layer without React | `packages/contracts` owns Zod contracts and registry metadata                 | Implemented.                                                                                             |
| Component registry                   | `packages/contracts/src/component-registry.ts` is shared by Builder/Renderer  | Implemented; renderer mapping parity should be generated.                                                |
| Editor Core boundary                 | `editor-commands.ts` is the command seam over GrapesJS                        | Partial by design; a standalone pure Editor Core is not introduced while Model A remains authoritative.  |
| CMS UI primitives                    | `apps/cms/app/ui` owns fields, surfaces, tables and resource state components | Improved; Audit and Users use shared table/pagination/empty-state primitives, broader migration remains. |
| Renderer runtime                     | `apps/renderer/app/renderer.tsx` validates and renders payloads               | Implemented; diagnostics can expose stable error codes in development.                                   |
| Tenant layer                         | `TenantContext`, connection manager and model registry own resolution         | Implemented; migration/health visibility remains.                                                        |
| Initial load/edit/save/publish flow  | API snapshot → GrapesJS → command → explicit save → published snapshot        | Implemented and E2E-covered.                                                                             |
| Event-driven preview                 | Origin-checked, schema-validated `postMessage` bridge                         | Implemented.                                                                                             |
| Error boundaries/observability       | API errors have request IDs and renderer has safe fallback                    | Partial; add structured renderer diagnostics and critical CMS error boundary.                            |
| Versioning/migrations                | Page payload versions V1/V2/V3 and document schema version 1 exist            | Partial; migration registry currently has metadata but no historical migration implementation.           |

## 04 — Editor Core and PageDocument

| Editor concern                            | Current source truth                                                    | Upgrade/status                                                                       |
| ----------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| One authoritative editable representation | GrapesJS Model A                                                        | Implemented and documented.                                                          |
| Serializable document                     | `PageDocument { schemaVersion, payload }`                               | Implemented; `migratePageDocument` accepts legacy raw payloads.                      |
| Explicit commands                         | insert/move/remove/duplicate/property/style/undo/redo commands exist    | Improved; `updateBinding` and inline rename require a persisted contract decision.   |
| Shared move semantics                     | `MoveNodeIntent` and `moveNodeByIntent` are shared                      | Implemented.                                                                         |
| Selection/session state                   | React state and refs, excluded from payload                             | Implemented.                                                                         |
| History owner                             | GrapesJS UndoManager                                                    | Implemented; no second history stack.                                                |
| Dirty/revision state                      | local mutation sequence, explicit save, conflict state                  | Implemented; autosave intentionally remains off.                                     |
| Save scheduler                            | Explicit save only                                                      | Deliberate current behavior; a future queue must remain command/dirty-driven.        |
| Inspector binding                         | Selected node selectors plus command-backed updates                     | Implemented for built-ins; complex form editing remains explicit local draft/commit. |
| Property schema                           | Registry metadata drives current inspector groups and semantic controls | Implemented for supported controls; conditional visibility metadata remains.         |
| Responsive inheritance                    | Desktop/tablet/mobile blocks with inherited hints and reset override    | Implemented.                                                                         |

## 05 — Visual builder UX

| UX requirement                          | Current source truth                                                                   | Upgrade/status                                                    |
| --------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Desktop workspace                       | Blocks/Layers, Canvas, Properties, viewport toolbar, save/preview header               | Implemented.                                                      |
| Adaptive workspace                      | Three columns collapse to stacked panels below tablet width                            | Implemented baseline; true resizable/collapsible sidebars remain. |
| Insert search/categories                | Component search is available; categories are registry metadata but not visual filters | Improved; category filters and favorites are optional follow-ups. |
| Layers tree                             | Hierarchy, expand/collapse, selection, search, drag handle and shared move             | Implemented baseline.                                             |
| Layers keyboard navigation              | Arrow/Home/End navigation with selection sync                                          | Implemented and covered by E2E.                                   |
| Rename/context/hide/lock/virtualization | Not persisted or exposed                                                               | Deferred until payload/editor permissions define semantics.       |
| Canvas modes                            | Select, hand, zoom, fit, minimap, viewport selector and breadcrumbs exist              | Implemented baseline; hover/path/drop polish remains.             |
| Drop feedback                           | before/inside/after indicators and invalid-drop feedback exist                         | Implemented baseline.                                             |
| Inspector grouping                      | Content/Layout/Spacing/Typography/Appearance/Advanced accordions                       | Implemented.                                                      |
| Semantic controls                       | number/unit/spacing/color/segmented/select/textarea/datetime fields exist              | Implemented for supported PagePayload values.                     |
| Responsive reset                        | Current breakpoint override can be reset to inherited value                            | Implemented.                                                      |
| Save status                             | saved/unsaved/saving/error/conflict header state                                       | Implemented.                                                      |
| Content-editor mode                     | No restricted mode                                                                     | Deferred P1 pending authorization/product decision.               |

## 06 — CMS UX and design system

| Design-system requirement  | Current source truth                                                          | Upgrade/status                                                               |
| -------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Task-oriented shell        | `PageHeader`, `ResourceToolbar`, route-level views and dedicated Builder      | Implemented baseline.                                                        |
| Shared fields              | `apps/cms/app/ui/fields.tsx` and `field-utils.ts`                             | Implemented for Builder and selected flows; resource migration remains.      |
| Shared surfaces            | Modal/Drawer with Escape, outside click, focus trap/restoration and body lock | Implemented; nested/empty-surface coverage remains.                          |
| DataTable                  | Shared CSS surface exists, markup is repeated                                 | Partial; extract only after preserving row-detail semantics.                 |
| Pagination                 | Repeated previous/next markup exists                                          | Partial; extract a typed control with accessible range/status.               |
| Empty/loading/error states | CSS and local implementations exist                                           | Partial; standardize copy and `aria-busy`/`role=status` patterns.            |
| Toast/feedback             | Inline alerts/notices are used                                                | Partial; choose one owner per mutation before adding a global toast.         |
| Combobox/menu/popover      | Workspace popover and native selects exist                                    | Partial; do not add a dependency until a real large dataset needs it.        |
| Responsive shell           | Explicit media queries, independent sidebar and table scrolling exist         | Implemented baseline; visual baseline coverage remains.                      |
| Density/tokens             | CSS variables and compact Builder controls exist                              | Improved; continue replacing repeated literals only with verified consumers. |
| Accessibility              | labels/focus states/dialog trap/layer keyboard paths exist                    | Partial; menu/list keyboard semantics and screen-reader audits remain.       |
| Resource consolidation     | Several views are extracted; dashboard still coordinates many resources       | Partial; extract one resource at a time with request-count tests.            |

## 07 — Multi-tenancy and security

| Security requirement       | Current source truth                                                       | Upgrade/status                                                |
| -------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Master/tenant topology     | Master services resolve tenant DB scope; tenant models use scoped registry | Implemented.                                                  |
| Request lifecycle          | authentication → tenant context → tenant model resolution                  | Implemented and E2E-covered.                                  |
| Connection cache isolation | cache key includes cluster and database; idle/size pruning exists          | Implemented; add metrics/health visibility.                   |
| Authorization              | server-side permission guards/services, UI hiding is supplementary         | Implemented for current permissions.                          |
| Company context            | header displays company; workspace is the context switcher                 | Implemented.                                                  |
| Public routing             | domain/slug resolver returns published public contract only                | Implemented.                                                  |
| Secrets                    | encrypted vault, redacted contracts and controlled execution paths         | Implemented; rotation UX remains.                             |
| Cross-tenant tests         | API/E2E organization/tenant isolation coverage exists                      | Implemented baseline; add overlapping-ID cache tests.         |
| Migration/provisioning     | tenant schemaVersion and provisioning services exist                       | Partial; failure/retry dashboard and migration runner remain. |

## 08 — Testing and quality gates

| Gate                | Current source truth                                                                | Upgrade/status                                                            |
| ------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Unit                | contracts, builder adapter/save, UI field utils, registry and service tests         | Implemented.                                                              |
| Integration         | Mongo suites are opt-in and cover API/persistence boundaries                        | Implemented; concurrent CAS/injected-failure coverage remains.            |
| E2E journeys        | Builder save/reload, DnD, responsive, preview, forms, publish, tenant and workflows | Implemented; full suite currently has 45 passing journeys.                |
| Visual regression   | No committed screenshot baseline suite                                              | Open P1; add after layout tokens stabilize.                               |
| Request regressions | Selected CMS bootstrap/extension flows have request assertions                      | Partial; add per-resource idle assertions during extraction.              |
| Registry parity     | Shared registry exists and renderer tests iterate every registered type             | Implemented baseline; generation and extension fixture automation remain. |
| Responsive admin    | Builder/CMS no-overflow journeys exist                                              | Implemented baseline; add per-route width matrix.                         |
| Definition of done  | quality gates and recovery handoff document current expectations                    | Implemented/documented.                                                   |

## 09 — Roadmap status

- R0: implemented audit and recovery baseline.
- R1: implemented Model-A document envelope, registry, command boundary, dirty/conflict state and CAS pointer advancement; injected-failure tests remain.
- R2: in progress; shared fields/surfaces/tokens and state primitives exist, while resource-level migration remains.
- R3: in progress/mostly implemented; keyboard Layers and resettable responsive inspector are now covered, while advanced Layers actions and sidebar resizing remain.
- R4: partial; resource views are extracted incrementally, but dashboard decomposition is not complete.
- R5: implemented baseline; registry-iterated parity and fallback diagnostics are covered, while generated extension fixtures remain.
- R6: implemented baseline; migration operations and observability remain.
- R7/R8: intentionally deferred until R1–R6 gaps are closed.

## 10 — AI working protocol

The protocol is treated as an engineering gate in this repository:

1. Read this context and existing handoffs before architecture changes.
2. Trace state ownership and request flow before patching UI symptoms.
3. Search shared contracts, commands and primitives before adding duplicates.
4. Add a regression test for each user-facing behavior.
5. Verify save/reload, permissions, renderer parity and responsive behavior where applicable.
6. Update the audit/handoff when current truth changes.

The next smallest logical slice is registry-generated renderer compatibility coverage,
followed by typed shared resource state primitives and one dashboard resource extraction.
