# Phase 23 — No-Code Builder UX & Open Composition Authoring

**Status: PARTIAL** — Phase 23 implementation and focused journeys are
complete, while the repository-wide Playwright gate still contains failures in
older route/auth/legacy-component journeys outside this phase.

## Scope

Phase 23 makes Open Composition authoring understandable without HTML, CSS,
DOM, Flexbox, Grid, payload, or component-internal knowledge. The persisted
contract remains `PagePayloadV8`; GrapesJS remains the live mutable editing
model and the renderer remains independent from Builder code.

## Implemented architecture

- Open Composition node types now have an explicit authoring registry in
  `packages/contracts/src/open-composition.ts`.
- Content properties use friendly labels, semantic controls, visibility rules,
  and the existing `PropertyControlRenderer` rather than runtime prop-type
  introspection.
- Style groups expose Layout, Size, Spacing, Typography, Background, Border,
  and Effects. Common controls use semantic values such as Vertical,
  Horizontal, Center, Full width, and inherited responsive values.
- Open Composition insertion uses `OPEN_COMPOSITION_REGISTRY` and the same
  structural command boundary for Add, Inspector, and canvas insertion.
- Builder selection is derived from the selected node object; the old duplicate
  `selectedNodeId` state was removed. Open Composition Layers show content
  nodes only, while style editing stays in the Inspector.
- Open Composition `partsStyle` is preserved by the GrapesJS adapter and
  rendered by the V8 renderer, including responsive part rules.
- New Open Composition nodes have safe, visible defaults. The Add panel has a
  guided empty state for blank pages.

## User-facing behavior covered

- Friendly content labels hide `formKey`, `fieldKey`, behavior identifiers, and
  other implementation-oriented fields from normal authoring.
- Contact Form fields can be selected as real content nodes, renamed, marked
  required, added as Phone fields, duplicated, deleted, undone, and styled
  without a duplicate pseudo-tree of style targets.
- Responsive style values show inherited viewport context and provide a Reset
  override action.
- V8 node insertion is prevented when the registry does not allow the child.
- Renderer output keeps node and part styles aligned with the Builder payload.

## Verification

The final verification record is maintained in
`docs/continuity/phase-23-final-handoff.md`. All final commands run with Node
24 because the repository declares `engines.node >=24`.

Playwright supports `E2E_API_PORT`, `E2E_CMS_PORT`, `E2E_RENDERER_PORT`, and
`E2E_API_BASE_URL` so the suite can run in an isolated port range when the AO
workspace service already owns a default port.

## Known remaining condition

The completed repository-wide Playwright run (99 tests at that point) reported
75 passing and 24 failing tests. The failures are concentrated in existing CMS
routing, auth/context, legacy component, integration, workflow, and
publishing journeys. The current suite adds one more Phase 23 structural test;
the Phase 23 file now passes 3/3 in its focused run, and the V8 renderer parity
journey passes. The original formatter issue in `tests/e2e/cms.spec.ts` was
normalized while parameterizing E2E URLs, so the final format gate passes.
