# Phase 14.2 Handoff — Inspector and Live-Model UX

Read [`phase-14.2.md`](../phase-14.2.md) for the full audit and decisions.

## Invariants

- Content owns semantic content only.
- Style owns visual properties only.
- Settings owns behavior/accessibility/advanced metadata.
- Actions do not belong in Inspector; use Context Toolbar, Layers or keyboard.
- GrapesJS is the live document engine and `PagePayload` is persisted truth.
- `editor-commands.ts` is the mutation boundary.
- `selectedNodeId` is canonical selection identity; snapshots are derived.
- `component:input` and `component:update` refresh the selected snapshot for
  Canvas → Inspector synchronization.

## Responsive contract

Use `resolveInspectorStyleValue()` for every responsive Inspector control. Show
the effective value, but retain authored value and inheritance source so tablet
or mobile overrides can be reset without changing desktop.

## Alignment contract

Write `style.base.textAlign` / `style.tablet.textAlign` /
`style.mobile.textAlign`. `props.align` is legacy fallback only. Renderer
resolution must prefer style alignment whenever it exists.

## Registry contract

`PAGE_COMPONENT_STYLE_CAPABILITIES` and `styleSchemaFor()` are the only source
for component style controls. Do not add style arrays or component-specific
Inspector branches in `builder-shell.tsx` for new components.

## UX contract

The activity rail is Add, Layers, Assets and Page settings. Add is registry
driven and uses Layouts/Elements tabs. Technical extension graph details live
under Page settings. The selected context toolbar follows canvas geometry and
must remain bounded when zooming, scrolling or near an edge.

Inspector rendering lives in `builder/inspector/builder-inspector.tsx`; keep
the shell focused on editor lifecycle, persistence and workspace composition.
