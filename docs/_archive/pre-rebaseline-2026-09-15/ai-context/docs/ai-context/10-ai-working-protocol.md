# 10 — AI Working Protocol

## 1. Purpose

This file defines how an AI coding agent should approach this repository so that it does not repeat earlier patterns of adding features without understanding shared architecture.

## 2. Required startup sequence

Before code changes:

1. Read `AI_CONTEXT.md`.
2. Read all files in `docs/ai-context/` in order.
3. Read existing phase documents and handoffs.
4. Inspect repository tree and package manifests.
5. Locate the implementation for the requested feature.
6. Trace state/data flow end to end.
7. Identify existing tests.
8. State assumptions only when source cannot resolve them.

## 3. For editor-related tasks

Always identify:

- canonical document owner;
- selected-node owner;
- command/mutation path;
- undo/history owner;
- save path;
- query/refetch behavior;
- renderer contract;
- component registry/schema;
- DnD implementation;
- tests for save/reload.

Do not patch only the visible React component if the bug originates in state ownership.

## 4. For CMS UI/UX tasks

Before redesigning:

- identify the primary user task;
- inventory existing shared primitives;
- choose list/dialog/drawer/page pattern deliberately;
- check responsive layout;
- check loading/empty/error states;
- check keyboard/accessibility basics;
- preserve current menu information architecture unless scope explicitly changes it.

Do not add more cards simply to visually separate data.

## 5. For API tasks

Check:

- authentication;
- tenant resolution;
- permission enforcement;
- validation;
- error mapping;
- idempotence where relevant;
- cache invalidation;
- version/revision semantics;
- tests with a second tenant.

## 6. For renderer tasks

Check:

- component registry contract;
- published document version;
- unknown node behavior;
- preview parity;
- responsive style resolution;
- form/integration behavior;
- no authenticated CMS dependency in public runtime unless intentionally designed.

## 7. Change discipline

Prefer focused changes with explicit boundaries.

When discovering adjacent debt:

- fix it if required for correctness and bounded;
- otherwise document it in the handoff/roadmap rather than expanding scope uncontrollably.

Do not perform a broad rewrite without proving why an incremental migration cannot meet the requirement.

## 8. Code cleanliness

Every change should reduce or at least not worsen:

- duplicate code;
- duplicate domain types;
- duplicate UI primitives;
- giant components;
- implicit effects;
- unstable dependencies;
- magic strings;
- hidden cross-module coupling.

Delete obsolete code only after verifying it is unused.

## 9. Testing protocol

For each user-facing fix:

- reproduce current failure when possible;
- add/update regression coverage;
- implement;
- verify persisted/reloaded behavior;
- verify no console/network regression;
- verify responsive state if UI changed.

For editor changes, a save/reload assertion is strongly preferred.

## 10. Documentation protocol

Update docs when changing:

- PageDocument schema;
- component registry contract;
- command model;
- tenant architecture;
- authorization model;
- builder layout conventions;
- UI primitive conventions;
- roadmap status.

Documentation should describe current truth, not only historical intention.

## 11. Handoff format after a substantial task

Provide/update a handoff containing:

### Goal

What was requested.

### Investigation

What code paths/state flows were inspected.

### Changes

Files/modules changed and why.

### Architectural decisions

Any new invariant or contract.

### Tests

What was added/run and results.

### Known limitations

What remains unresolved.

### Next recommended step

The smallest logical continuation.

## 12. AI decision rule

When choosing between adding another feature and fixing a foundational defect affecting many workflows, prioritize the foundational defect unless the user explicitly changes scope.

## 13. Core reminder

> A visual builder is trusted only when the user can edit, save, reload, preview, and publish without surprises.
