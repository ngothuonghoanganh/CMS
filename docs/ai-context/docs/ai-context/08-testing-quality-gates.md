# 08 — Testing and Quality Gates

## 1. Testing philosophy

The most valuable tests protect user journeys and architecture invariants. A page builder can have high unit-test coverage and still be unusable if persistence, drag/drop, or renderer parity breaks.

## 2. Test layers

### Unit

Use for:

- command behavior;
- document utilities;
- schema validation;
- migration functions;
- drop validation;
- tenant resolution helpers;
- permission predicates.

### Integration

Use for:

- API + persistence behavior;
- save revision conflicts;
- component registry + renderer contract;
- forms/submissions;
- tenant DB boundaries.

### E2E / Playwright

Use for complete UI workflows.

### Visual regression

Use stable screenshots for critical layouts such as builder shell, inspector, layers, primary CMS list pages, dialogs, and responsive states.

## 3. Mandatory editor journeys

Maintain tests for:

1. create page → save → reload;
2. add component → save → reload;
3. update content property → reload;
4. update style property → reload;
5. reorder siblings;
6. move node to a different parent;
7. Layers move updates Canvas;
8. Canvas move updates Layers;
9. delete → undo → redo;
10. desktop style + mobile override behavior;
11. add form → preview → publish → renderer displays form;
12. publish → public renderer matches published version.

## 4. Persistence assertions

Tests must verify the server representation, not only visible UI state.

For example:

```text
edit → save → reload browser/page → assert persisted result
```

A test that checks the DOM immediately after local state mutation is insufficient for save correctness.

## 5. Network regression tests

Repeated API calls are a known failure class.

For critical screens, measure requests:

- after initial load;
- after idle period;
- after one edit;
- after save;
- after preview.

Suggested invariant:

> After the screen becomes idle and no autosave is pending, unexpected API calls should be zero.

Exact expected counts should be encoded for high-risk workflows.

## 6. Renderer contract tests

For every registered component type:

- create minimal valid node;
- validate node contract;
- render in preview/test renderer;
- assert no unsupported-type failure.

Where feasible generate these tests from the registry so adding a new component automatically creates coverage expectations.

## 7. Responsive CMS tests

At supported widths, assert:

- no page-level horizontal overflow;
- navigation usable;
- dialogs within viewport;
- data table scroll container behaves;
- header actions remain accessible;
- builder sidebars adapt according to design.

## 8. Tenant tests

Tenant isolation is a release blocker. Include API-level tests using two tenants with overlapping-looking entity IDs/data.

## 9. Quality gates before merge

For significant editor/CMS changes:

- lint/typecheck pass;
- unit/integration tests pass;
- relevant Playwright journey passes;
- no new console errors;
- no uncontrolled network loop;
- no undocumented payload schema change;
- screenshots/manual check at agreed responsive widths;
- docs updated if architecture behavior changed.

## 10. Definition of Done

A feature is not done merely because its UI appears.

Done means:

- expected user workflow works;
- state persists;
- reload reproduces it;
- permissions apply;
- renderer supports it if page-related;
- responsive behavior is acceptable;
- tests protect the behavior;
- documentation matches new architecture.
