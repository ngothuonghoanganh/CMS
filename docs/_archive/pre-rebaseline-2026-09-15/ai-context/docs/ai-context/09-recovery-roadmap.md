# 09 — Architecture & UX Recovery Roadmap

## Purpose

This roadmap temporarily prioritizes stability and usability over adding large new feature families.

Priority notation:

- P0 — platform/editor reliability blocker;
- P1 — important product quality/capability;
- P2 — enhancement/differentiation after foundations are healthy.

## R0 — Deep Source Audit — P0

### Goals

Understand the repository as implemented, not as intended.

### Deliverables

- repository/package map;
- runtime/framework/dependency map;
- CMS/API/renderer entry points;
- page state ownership diagram;
- GrapesJS integration analysis;
- request/network lifecycle map;
- tenant-resolution map;
- builder → save → renderer data flow;
- duplicated UI primitive inventory;
- dead/unused code inventory;
- top architectural risks ranked by impact.

### No large refactor until R0 explains current ownership.

## R1 — Editor Foundation — P0

### Goals

Create one reliable editing model.

### Work

- canonical PageDocument decision;
- Editor Core ownership;
- Component Registry contract;
- command layer;
- shared move/reparent semantics;
- undo/redo owner;
- dirty/revision state;
- save scheduler;
- conflict/error behavior;
- migration/version rules.

### Exit criteria

Add/update/move/reparent/save/reload is deterministic and protected by tests.

## R2 — Shared Design System — P0

### Goals

Remove UI primitive fragmentation and establish responsive admin foundations.

### Work

- button/input/select/form field;
- dialog/drawer/menu/popover;
- semantic number/color/date/time controls;
- table + pagination;
- page shell;
- responsive containers;
- empty/loading/error states;
- common spacing/type tokens.

### Exit criteria

Feature pages compose shared primitives rather than custom equivalents.

## R3 — Builder UX Rebuild — P0

### Goals

Make the editor genuinely usable.

### Work

- builder workspace shell;
- Layers document tree;
- Canvas interaction model;
- drag/drop indicators;
- cross-parent move;
- pan/zoom/fit;
- selection/breadcrumb sync;
- schema-driven Inspector;
- Content/Style/Advanced grouping;
- responsive overrides;
- save status.

### Exit criteria

Core builder journeys can be completed without ambiguous interaction or lost state.

## R4 — CMS UX Consolidation — P1

### Goals

Replace oversized block-based CRUD screens with task-oriented workflows.

### Candidate areas

- Pages;
- Forms;
- Leads/Submissions;
- Integrations;
- Users/Roles;
- Settings;
- tenant/company administration appropriate to role.

### Patterns

- list + table;
- search/filter;
- row action menus;
- drawer/modal where appropriate;
- dedicated pages for complex tasks;
- consistent pagination;
- responsive behavior.

## R5 — Renderer Integrity — P0/P1

Renderer contract defects discovered earlier should be fixed immediately; this phase completes systematic hardening.

### Work

- registry parity;
- component compatibility tests;
- unknown-component diagnostics;
- preview/public parity;
- published snapshot behavior;
- forms rendering/submission path;
- payload migrations.

## R6 — Tenant Hardening — P1

### Work

- master DB / tenant DB resolver review;
- authorization boundary review;
- cache-key review;
- tenant connection lifecycle;
- tenant migration strategy;
- cross-tenant automated tests;
- operator vs tenant-role UX.

## R7 — Workflow UX — P1

After foundations stabilize:

- content editor mode;
- reusable sections/components;
- templates;
- design tokens/theme controls;
- asset workflow;
- revision/history UX;
- publish workflow improvements.

## R8 — Product Differentiation — P2

Only after reliability is high:

- analytics and conversion insights;
- experiments/A-B testing;
- collaboration/comments/approval;
- AI-assisted page generation/editing;
- optimization recommendations;
- advanced reusable content;
- marketplace/plugin direction if justified.

## Prioritized first five actions

If work must be narrowed, do these first:

1. stabilize PageDocument/save/editor-renderer contract;
2. establish one Command Engine;
3. establish design system + property schema engine;
4. rebuild Layers + Canvas drag/drop;
5. rebuild CMS CRUD patterns.

## Explicit non-goals during recovery

Avoid spending major effort on:

- many new element types;
- large animation catalog;
- large new integration catalog;
- marketplace architecture;
- full backend rewrite;
- cosmetic redesign that leaves state architecture untouched.
