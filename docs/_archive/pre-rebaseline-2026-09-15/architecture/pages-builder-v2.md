# Pages + Builder V2 implemented architecture

**Status:** B0–B4 core implemented; B5+ follow-up

This document records the implementation decisions for the Pages and Builder V2
increment. The product brief remains in [`docs/pages-builder-v2.md`](../pages-builder-v2.md).

## Data flow and boundaries

The existing persistence boundary is unchanged:

```text
GrapesJS live document
        ↓
PageDocument / PagePayload validation
        ↓
immutable PageVersion
        ↓
publish
        ↓
production renderer
```

React state owns shell state, selection summaries, loading and notices. It does not
become a second editable document. GrapesJS remains the live editor source during a
session, while the payload remains the only persisted content contract.

Pages remains dashboard-orchestrated for API, RBAC and request-race handling, but its
composition is extracted to `apps/cms/app/pages/pages-view.tsx`. The tree is a view of
canonical paths and optional `parentId`; it does not introduce a second routing or
hierarchy model. `Site.homePageId` remains the homepage authority.

## Component and style architecture

`PAGE_COMPONENT_REGISTRY` is exhaustive and supplies the Builder palette and component
property capabilities. `PAGE_RENDERER_REGISTRY` is typed against the same component
union, so adding a supported core node without a renderer fails type checking.

`packages/contracts/src/style-registry.ts` is the shared style capability registry. It
owns:

- editor-facing property keys;
- persisted payload keys;
- CSS property names;
- control metadata and groups;
- responsive breakpoint labels, editor media queries and renderer bounds.

The adapter, Builder Inspector and production renderer consume those definitions. The
payload schema remains strict and only accepts the supported, sanitized style values.

## Builder shell

The dedicated Builder route now has a top bar, viewport controls, a collapsible tool
rail, switchable Add/Layers/Assets/Sections panels, a primary Canvas, locked site-level
navigation chrome, and Content/Style/Settings Inspector tabs. Existing GrapesJS history,
layer drag/drop, keyboard movement, conflict-aware manual save, preview messaging and
extension gating remain in place.

Site header/footer are intentionally read-only chrome backed by site navigation. They
are not copied into PagePayload. A later global-component milestone can add editing
surfaces without changing this page content boundary.

Responsive style controls show inherited values for tablet/mobile and expose a reset
action for viewport overrides. The editor and renderer use the same breakpoint contract.

## Preview and renderer parity

The existing origin-checked preview bridge remains the live-preview path. Messages are
validated with the shared `PagePreviewMessageSchema` and `PagePreviewReadyMessageSchema`,
and the bridge only accepts messages from the expected opener/origin. The renderer adds
stable payload node attributes for future hover/selection synchronization.

Registry parity and adapter round-trip tests cover the shared core contract. The
canvas is still GrapesJS-backed in this increment; a renderer-backed semantic canvas,
typed node hover/selection messages and rectangle synchronization are intentionally
deferred until the current interaction contract is stabilized.

## Save, publish and compatibility

Save remains a manual immutable-version checkpoint; no fake autosave was introduced.
The Builder filters late editor events against the acknowledged payload so a saved
version is not falsely shown as clean when a real newer payload exists. Publish is
gated on validation, unsaved state, save conflicts and in-flight saves.

Existing public routes, custom domains, navigation, SEO, forms, integrations,
workflows, extensions, multi-tenancy and payload versions remain on their existing
endpoints and contracts. Destructive page removal uses the shared confirmation Modal.

## Follow-up milestones

- B5: reusable section patterns, token/design-system extension points and global
  component authoring.
- B6: production-renderer-backed canvas and typed node interaction protocol.
- B7: richer publish checks, checkpoints/version presentation and Page Health rules.
- B8: command-layer hardening, responsive doctor and validated AI payload operations.

See [`docs/continuity/pages-builder-v2-handoff.md`](../continuity/pages-builder-v2-handoff.md)
for the file-level handoff and validation notes.
