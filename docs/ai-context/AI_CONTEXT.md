# AI Context — Payload Page Platform

> **Entry point for every AI agent and engineer working on this repository.**
>
> Read this file first. Then read every document under `docs/ai-context/` in numeric order before making architectural, editor, renderer, tenant, or UX changes.

## Product identity

This repository belongs to the **Payload Page Platform** project: a multi-tenant platform that allows companies to create, manage, preview, publish, and operate pages without editing source code.

The product is not intended to become a generic CRUD/database admin. The target is a **visual Page platform** composed of:

- CMS / admin application;
- visual page builder;
- public renderer / publishing runtime;
- API and domain services;
- forms, submissions, and leads;
- notifications and integrations;
- users, roles, permissions;
- tenant/company isolation;
- extensible component and feature architecture.

## Current stage

Many functional phases have already been implemented. The current bottleneck is not feature count; it is **architecture consistency, editor reliability, persistence correctness, renderer parity, and UI/UX quality**.

The project is therefore entering an **Architecture & UX Consolidation / Recovery** stage before adding large new feature areas.

Phase 14 Editor Core is implemented on the existing Model A boundary: the command
engine is authoritative for Builder mutations, `PagePayload` remains the persisted
source of truth, GrapesJS remains the current live editor engine, and the renderer
remains production authority.

Phase 14.1 hardened that boundary. Treat `PagePayload` as persisted content truth,
GrapesJS as the current live editor document engine, `editor-commands.ts` as the
authoritative user mutation boundary, `PAGE_COMPONENT_REGISTRY` as component and
placement capability truth, `PAGE_STYLE_PROPERTY_DEFINITIONS` as styling capability
truth, and the public renderer as production rendering truth. UI code must not
directly mutate GrapesJS for user document changes; documented escape hatches are
limited to hydration, editor-only preview decoration, presentation-only viewport
paint, selection, and guarded native clone identity repair.

## Non-negotiable product constraints

### Tenant model

- One tenant = one company.
- Each company operates in its own account context.
- Each company should have its own tenant database.
- A master/control database manages tenant metadata and tenant-database resolution.
- Normal tenant users should see the current company context; the header company display is not a casual cross-company switcher.
- Cross-tenant data access must never be possible.

### Editor model

- There must be one canonical page document/payload model.
- Canvas, Layers, Inspector/Properties, History, Save, Preview, and Renderer must derive from that shared model.
- Structural mutations should use one command system.
- Editor and renderer must share a versioned component contract.
- Property controls should be schema-driven.
- Save behavior must be explicit and testable.
- New Canvas, Layers, Inspector, keyboard, and Quick Add mutations must dispatch
  through `apps/cms/builder/editor-commands.ts` and use its shared placement
  boundary; do not mutate GrapesJS directly from a new UI surface.
- Viewport changes are UI state and must not create PagePayload mutations. New
  responsive style changes must use the command boundary and the shared style
  registry; do not capture displayed editor styles during serialization.

## Known recurring problems

Treat the following as architectural symptoms, not isolated CSS bugs:

- CMS screens contain too many large blocks and become very long.
- Overflow and responsive behavior are inconsistent.
- Create/update/detail workflows are often rendered inline when modal/drawer/page patterns would be clearer.
- Properties panel is dense, long, and difficult to understand.
- Properties have previously failed to persist after save/reload.
- Canvas drag/drop and Layers drag/drop are difficult and can diverge.
- Reparenting elements between different parents has been unreliable.
- Builder and renderer have drifted; components available in the editor have previously failed to appear correctly in the renderer.
- CMS/renderer have previously entered repeated API-call/refetch loops.
- Responsive CMS behavior is not production quality.

## UX references

Use mature products as interaction references, not as templates to copy:

- Shopify — simple settings, adaptive sidebars, content-first editing.
- Webflow — Navigator/Layers hierarchy, Style panel, responsive editing.
- Builder.io — Insert/Layers/Style workspace architecture.
- GrapesJS — component model, traits, storage/history capabilities where appropriate.
- Framer — interaction quality, canvas feel, modern editor ergonomics.

## Before modifying code

Every AI agent must:

1. Read all `docs/ai-context/*.md` files in order.
2. Read existing phase and handoff documentation in the repository.
3. Inspect the actual implementation before assuming documentation matches code.
4. Identify current state ownership and data flow for the feature being changed.
5. Search for shared components, commands, schemas, and utilities before adding duplicates.
6. Preserve tenant isolation and renderer compatibility.
7. Add/update tests for the user journey being modified.
8. Update documentation when an architectural decision changes.

## Do not do by default

Do not:

- add major feature areas before editor/core UX stabilization;
- introduce another independent copy of page state;
- implement separate move/reparent semantics for Canvas and Layers;
- create a new form/input primitive per feature;
- continuously poll APIs to synchronize preview;
- expose every advanced capability to normal users;
- rewrite the entire backend merely because CMS UI is poor;
- change the tenant/company model without an explicit architecture decision;
- silently break or mutate the public page payload contract.

## Reading order

1. `docs/ai-context/01-product-and-domain.md`
2. `docs/ai-context/02-current-state-and-problem-map.md`
3. `docs/ai-context/03-target-architecture.md`
4. `docs/ai-context/04-editor-core-and-page-document.md`
5. `docs/ai-context/05-builder-ux-spec.md`
6. `docs/ai-context/06-cms-ux-and-design-system.md`
7. `docs/ai-context/07-multitenancy-and-security.md`
8. `docs/ai-context/08-testing-quality-gates.md`
9. `docs/ai-context/09-recovery-roadmap.md`
10. `docs/ai-context/10-ai-working-protocol.md`

## Guiding principle

> **Optimize for reliable end-to-end user workflows, not feature count.**
