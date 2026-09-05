# Pages & Builder V2 Architecture

**Status:** Accepted — implementation target
**Date:** 2026-08-29
**Scope:** CMS Pages experience, visual builder, PagePayload authoring, preview, renderer parity, reusable sections/components, responsive authoring, draft/version UX
**Out of scope:** destructive persistence migrations, tenant model changes, auth/RBAC redesign, billing redesign, public-route renaming

---

## 1. Purpose

This document defines the next architecture and UX direction for the **Pages** experience and the **Visual Builder**.

The product goal is not to expose a database-oriented page editor. The goal is to let a non-technical user create, organize, design, preview, and publish a complete website without editing source code.

The implementation MUST preserve the current core model:

```text
Company / Tenant
└── Workspace
    └── Site
        ├── Homepage
        ├── Page
        ├── Page
        ├── Navigation
        ├── Domains
        └── Site-level settings
```

Canonical public routing remains:

```text
/:siteSlug                  -> site homepage
/:siteSlug/:pagePath        -> child page
```

On custom domains the equivalent canonical page path is resolved without the site-slug prefix.

The builder may change substantially, but the public renderer remains the production authority for what visitors receive.

---

## 2. Current state

Relevant implementation areas:

- `apps/cms/app/pages/pages-page.tsx` and `pages-view.tsx`
  - own the Pages route data, metadata mutations, selection, and page-specific UI;
  - Pages is still primarily a filtered resource inventory;
  - page metadata is edited in a drawer;
  - Builder opens as a dedicated route.
- `apps/cms/builder/builder-shell.tsx`
  - owns the current visual-builder shell;
  - contains block palette, Layers, Inspector, responsive controls, version save state, preview integration, extension controls, and builder orchestration.
- `apps/cms/builder/grapes-editor.tsx`
  - GrapesJS-backed editable document;
  - live editor interaction, selection, drag/drop, history, canvas behavior, serialization.
- `apps/cms/builder/builder-adapter.ts`
  - converts `PagePayload` nodes to/from GrapesJS components;
  - enforces supported editor node/style behavior.
- `packages/contracts/src/component-registry.ts`
  - current shared page-component definitions and property metadata.
- `apps/renderer/app/renderer.tsx`
  - production PagePayload renderer;
  - renders page nodes, responsive styles, forms, extensions, and site navigation.
- `docs/cms-ui.md`
  - current CMS shell conventions.
- `docs/ux/layout-architecture.md`
  - list-first CMS surfaces, modal/drawer conventions, responsive ownership.

### 2.1 Existing strengths that MUST be preserved

1. **GrapesJS is the live editor source during an edit session.**
2. **PageDocument/PagePayload is the persisted contract**, not arbitrary editor HTML.
3. Draft payloads are validated before persistence.
4. Renderer consumes the same PagePayload domain instead of editor persistence state.
5. Component hierarchy is explicit and validated.
6. Responsive style data is persisted in the PagePayload contract.
7. Preview already has a `postMessage` bridge between CMS and renderer.
8. Renderer nodes already expose stable `data-payload-node-id` and `data-payload-node-type` attributes.
9. Existing page versions, publishing, forms, navigation, SEO, extensions, domains, analytics, and routing must continue to work.

These are architectural advantages. Builder V2 should improve the authoring surface without replacing these guarantees with raw HTML/CSS storage.

---

## 3. Product principles

### 3.1 Pages is a website structure tool, not a record table

A user should think:

> “I am managing the pages of my website.”

not:

> “I am editing Page records belonging to a Site record.”

The primary model is a **website sitemap**.

### 3.2 The builder must be approachable before it is powerful

Common actions must not require knowledge of CSS, flexbox, grid, DOM structure, or GrapesJS concepts.

Advanced controls may exist, but they must be progressive-disclosure controls.

### 3.3 Builder and Renderer parity is a hard invariant

If a persisted payload is valid and visible in the builder, production rendering of that same payload must be equivalent except for editor chrome and intentionally documented editor-only placeholders.

No feature is considered complete if only the builder supports it.

### 3.4 Production components are the long-term rendering authority

The builder may use GrapesJS as an editing engine, but production visual output must increasingly be derived from the real renderer rather than parallel editor-only markup.

### 3.5 Prefer semantic layout controls over raw CSS controls

Primary UX should expose concepts such as:

- Stack
- Row
- Columns
- Grid
- Align
- Distribute
- Gap
- Padding
- Width

instead of requiring a user to understand `display:flex`, `justify-content`, or `grid-template-columns`.

Raw/advanced style controls may still be exposed when safe and contract-supported.

### 3.6 Every destructive or complex action must be recoverable

The builder must evolve toward autosave, checkpoints, explicit version history, and restore workflows.

---

## 4. Pages V2

### 4.1 Page responsibility

The `Pages` CMS route becomes a **Site Map Manager**.

Primary tasks:

1. select current Site;
2. understand website structure immediately;
3. create a page;
4. open Builder;
5. preview a page;
6. publish/unpublish;
7. set/change homepage;
8. inspect status and URL;
9. duplicate/delete;
10. access metadata, SEO, versions, workflows, and related configuration.

### 4.2 Recommended desktop layout

```text
┌──────────────────────────────────────────────────────────────┐
│ Pages                                      + New page        │
│ Site: Acme Website                                            │
├───────────────────────┬──────────────────────────────────────┤
│ Website structure     │ Selected page                        │
│                       │                                      │
│ 🏠 Home        /      │  Home                                │
│    About       /about │  /acme                               │
│    Services    /...   │  Published                           │
│    Contact     /...   │                                      │
│                       │  [Edit page] [Preview] [Publish]      │
│                       │                                      │
│                       │  thumbnail / page summary            │
└───────────────────────┴──────────────────────────────────────┘
```

The exact visuals may change, but the information hierarchy should remain.

### 4.3 Site tree behavior

The site tree should show:

- page name;
- canonical path;
- homepage marker;
- draft/published state;
- validation/problem indicator when relevant;
- optional nested visual grouping if nested page paths become a first-class feature.

The current routing model does not require page hierarchy to equal content-node hierarchy. Do not invent persistence nesting only for visual presentation.

### 4.4 Page detail panel

Selecting a page should expose compact information without forcing immediate navigation:

- title;
- canonical path;
- full public URL preview;
- homepage state;
- draft/published state;
- last updated;
- latest version/checkpoint summary;
- primary actions.

Secondary settings should remain in a drawer or modal:

- General metadata;
- URL/path;
- SEO;
- workflow configuration;
- versions/history;
- duplicate/delete.

### 4.5 Create page workflow

`+ New page` should open a focused creation flow.

Initial creation sources:

1. **Blank page**
2. **Template**
3. **Duplicate existing page**
4. **AI generated page** — future phase, only after payload-operation safety exists

Required metadata:

- Title
- Path

Optional metadata:

- Description
- Template/source
- Set as homepage, only when valid

The flow must validate canonical path conflicts before success.

### 4.6 Page thumbnails

Pages V2 should support preview thumbnails as a non-blocking enhancement.

Do not make page management depend on thumbnail generation.

A thumbnail may be generated from the production preview renderer after save/checkpoint/publish and cached as derived data.

---

## 5. Builder V2 shell

The builder remains a dedicated workspace route.

### 5.1 Target information architecture

```text
┌────────────────────────────────────────────────────────────────────┐
│ ← Pages | Home / | Save state | Undo Redo | Desktop Tablet Mobile │
│                                      Preview | Publish              │
├─────┬────────────────┬────────────────────────────┬────────────────┤
│     │ active panel   │                            │ Inspector      │
│ +   │                │                            │                │
│ ☰   │ Add / Layers   │       Visual Canvas        │ Content        │
│ 🖼   │ Assets         │                            │ Style          │
│ ◆   │ Sections       │                            │ Settings       │
│     │                │                            │ Advanced       │
├─────┴────────────────┴────────────────────────────┴────────────────┤
│ Breadcrumb: Section > Container > Button             Zoom / Fit   │
└────────────────────────────────────────────────────────────────────┘
```

### 5.2 Left activity rail

The builder should use a compact activity rail with one active secondary panel.

Initial activities:

- Add
- Layers
- Assets
- Sections / Patterns

Future activities:

- Symbols / Global components
- Data
- Page health
- AI assistant

Only one large left panel should normally be open at a time. Avoid stacking `Blocks` and `Layers` vertically in the same fixed-width column.

### 5.3 Resizable/collapsible panels

Desktop:

- left panel can collapse;
- inspector can collapse;
- optional resizing within safe min/max widths;
- canvas always owns the remaining space.

Tablet/mobile CMS viewport:

- canvas remains primary;
- side panels become overlays/drawers;
- never stack every editor panel into one very tall document;
- body/page-wide horizontal overflow is forbidden.

### 5.4 Top toolbar

Must include:

- back to Pages;
- page identity/path;
- save status;
- undo/redo;
- viewport selector;
- Preview;
- Publish when permitted.

Optional:

- command palette;
- page settings;
- more menu.

### 5.5 Bottom/context toolbar

Recommended:

- selected-node breadcrumb;
- zoom;
- fit canvas;
- optional X-Ray mode.

This reduces reliance on Layers for simple parent navigation.

---

## 6. Builder interaction model

### 6.1 Selection synchronization

Selection must be synchronized among:

- canvas;
- Layers;
- Inspector;
- breadcrumb.

Selecting an item anywhere selects the same stable PagePayload node ID everywhere.

### 6.2 Context toolbar

Selected canvas elements should expose a compact contextual toolbar for common actions:

- move/drag handle;
- duplicate;
- delete;
- move up/down where meaningful;
- wrap/container action where safe;
- hide/show at viewport when supported.

Do not force users into the Inspector for every common action.

### 6.3 Quick Add

When hovering valid insertion boundaries, the canvas should be able to show a `+` insertion affordance.

Quick Add must use the same parent/child validation as Layers drag/drop and regular Add operations.

There must be one placement-validation system, not separate UX-specific rule sets.

### 6.4 Drag/drop

Drag/drop must provide:

- clear source ghost;
- clear before/inside/after target indicator;
- invalid-target visual state;
- auto-scroll;
- parent/child validation;
- cross-parent movement;
- keyboard alternatives where practical;
- escape/cancel behavior.

The current builder interaction work should be retained and simplified behind reusable commands.

### 6.5 Inline text editing

Text-like content should support direct canvas editing when parity and serialization are reliable.

Examples:

- heading;
- paragraph/rich text;
- button label.

Inspector editing remains available as an alternative.

---

## 7. Inspector V2

The Inspector should have stable top-level tabs:

1. **Content**
2. **Style**
3. **Settings**

Optional fourth tab:

4. **Advanced**

Do not expose every possible property simultaneously.

### 7.1 Content

Examples:

- text;
- image source/alt;
- button label/link;
- form fields;
- countdown configuration;
- component-specific content.

### 7.2 Style

Primary groups:

- Layout
- Size
- Spacing
- Typography
- Background
- Border
- Effects

Groups should be collapsible and show a compact summary where useful.

### 7.3 Settings

Examples:

- element ID / anchor;
- accessibility labels;
- target behavior;
- visibility;
- component-specific runtime settings.

### 7.4 Advanced

Only contract-safe controls belong here.

Do not add arbitrary unvalidated CSS textareas or arbitrary scripts to core PagePayload.

---

## 8. Responsive authoring

Responsive behavior is a first-class builder feature.

Supported semantic viewports remain aligned with payload/renderer contracts:

- desktop/base;
- tablet;
- mobile.

### 8.1 Shared breakpoints

Breakpoint values MUST be declared once in a shared contract/runtime module.

The builder and renderer MUST NOT maintain separate hard-coded breakpoint definitions.

### 8.2 Inheritance UX

For every responsive property the inspector should communicate:

- inherited from base;
- overridden at current viewport;
- reset override.

A user should be able to understand why a mobile element looks different without inspecting payload JSON.

### 8.3 Responsive safety diagnostics

Future Page Health checks should detect at least:

- horizontal overflow;
- fixed width larger than viewport;
- inaccessible hidden content patterns;
- oversized images;
- text clipping;
- conflicting min/max sizes.

Diagnostics should guide; they should not silently rewrite user content.

---

## 9. Layout component strategy

The existing low-level `section` and `container` model remains valid, but the authoring UX needs more semantic layout primitives.

Recommended component families:

### 9.1 Layout

- Section
- Container
- Stack
- Row
- Columns
- Grid
- Spacer
- Divider

### 9.2 Content

- Heading
- Text / Rich Text
- Image
- Video
- Icon
- List
- Badge

### 9.3 Conversion

- Button
- Form
- CTA group
- Social links

### 9.4 Site-level / reusable

- Navigation/Header
- Footer
- Breadcrumb
- Global component instance

### 9.5 Extension

- Countdown
- Custom extension blocks

Do not implement every item immediately. The component registry must be capable of growing into this shape first.

---

## 10. Patterns / Section Library

A **Pattern** is a reusable composition of normal PagePayload nodes.

Examples:

- Hero
- Features
- Testimonials
- Pricing
- FAQ
- Contact
- Gallery
- CTA

A Pattern should not require a new monolithic renderer node if the result can be represented as existing components.

Insertion flow:

```text
Pattern definition
    -> instantiate nodes
    -> assign new stable node IDs
    -> validate tree
    -> insert using normal builder command
    -> serialize as normal PagePayload
```

This keeps runtime complexity lower and makes patterns editable after insertion.

---

## 11. Design system / Brand Kit

The builder should evolve from one-off values toward reusable design tokens.

Initial token categories:

- colors;
- typography;
- spacing;
- radius;
- shadows;
- container widths.

Long-term goal:

```text
Site Brand Kit
    -> semantic tokens
        -> Primary
        -> Surface
        -> Text
        -> Heading font
        -> Body font
        -> Button radius
        -> Section spacing
```

Users should be able to choose semantic values rather than repeatedly entering raw values.

The renderer must resolve the same tokens.

Token references must be explicit in persisted contracts; do not rely on CMS-only CSS variables that production does not know about.

---

## 12. Global components and site chrome

A multi-page website requires reusable site-level content.

The builder preview should eventually display:

```text
[locked/global] Site Header / Navigation
PagePayload main content
[locked/global] Site Footer / Navigation
```

The current production renderer already composes navigation around page content. Builder V2 should make that structure visible.

### 12.1 Initial behavior

Header/footer may initially be read-only in the page builder with contextual actions:

- `Edit navigation`
- `Edit site header`
- `Edit site footer`

### 12.2 Long-term behavior

Introduce versioned global components/symbols that can be reused across pages.

Editing a global instance should make scope explicit:

- edit this instance;
- edit global definition.

Do not silently mutate every page without communicating global scope.

---

## 13. Builder ↔ Renderer parity contract

This section is normative.

### 13.1 One PagePayload contract

Persisted content MUST remain PagePayload/PageDocument.

Forbidden as canonical persisted content:

- GrapesJS project JSON as the public domain contract;
- arbitrary raw generated HTML as the page source of truth;
- editor-only DOM snapshots.

### 13.2 One shared component registry

Every persisted node type must have a shared definition containing enough metadata to validate:

- node type/version;
- allowed parents;
- allowed children;
- slots;
- property schema;
- supported responsive/style capabilities;
- migrations.

Editor and renderer adapters may live in different packages, but they MUST reference the same definition identity/version.

### 13.3 Exhaustive runtime mapping

Renderer registry should become exhaustive for supported persisted component types.

Prefer compile-time failure when a component type is added without a production renderer.

Avoid a permissive `Partial<Record<...>>` for core supported types unless the type is explicitly optional/extension-driven.

### 13.4 Shared style capability definition

Style property mapping currently exists in multiple implementation areas. Builder V2 must centralize:

- allowed style properties;
- serialized PagePayload property name;
- editor property name if needed;
- React/CSS output name;
- responsive support;
- units/options/validation;
- security restrictions.

Conceptually:

```ts
StylePropertyDefinition {
  key
  payloadKey
  cssProperty
  editorProperty?
  responsive
  control
  validation
}
```

The exact TypeScript shape may differ.

The architectural requirement is single-source capability metadata.

### 13.5 Shared breakpoints

Breakpoints are part of the rendering contract and must be shared.

### 13.6 Parity tests

For every core component, tests should cover:

1. valid default node parses;
2. payload -> editor -> payload round trip;
3. renderer accepts the same payload;
4. base styles render;
5. tablet/mobile styles render;
6. unsupported properties fail at the correct boundary;
7. component nesting rules match builder placement rules.

A new component is incomplete until these tests exist.

---

## 14. Renderer-backed canvas direction

This is the preferred long-term architecture.

The current builder uses GrapesJS-rendered editor DOM while a separate Live Preview uses the renderer. This creates unavoidable duplication for forms, extensions, and future production components.

The target is to increasingly use the **production renderer as the visual canvas**.

### 14.1 Existing foundation

The project already has useful prerequisites:

- PageDocument snapshots;
- renderer live preview bridge using `postMessage`;
- stable node IDs;
- `data-payload-node-id` attributes in renderer output;
- renderer iframe/window boundary;
- validated PagePayload serialization.

### 14.2 Target flow

```text
Builder commands / document model
        ↓
Validated PageDocument
        ↓ postMessage
Production Renderer iframe
        ↓
Actual production React components
        ↓
node hover / selection / measurements
        ↓ postMessage
CMS editor chrome and inspector
```

### 14.3 Responsibilities

**Renderer iframe owns:**

- real component markup;
- real page styles;
- real responsive rendering;
- site header/footer/navigation;
- runtime-safe component preview.

**CMS owns:**

- selection overlays;
- drag/drop chrome;
- insertion indicators;
- Layers;
- Inspector;
- command execution;
- history/save state.

### 14.4 Migration strategy

Do NOT rewrite the builder in one step.

Recommended progression:

1. preserve GrapesJS model/history/serialization;
2. add strict parity tests;
3. expand renderer live-preview bridge;
4. add renderer-to-CMS selection events;
5. add node bounding-rect/hover bridge;
6. display production renderer as optional `Production Canvas` mode;
7. move editor chrome outside iframe;
8. migrate interactions gradually;
9. evaluate whether GrapesJS is still required as the document engine after feature parity.

GrapesJS should not be removed merely for aesthetic reasons.

---

## 15. Save, autosave, checkpoints, and versions

Current page saves create explicit versions. Builder V2 must not implement naive high-frequency autosave by continuously creating immutable page versions.

Separate these concepts:

### 15.1 Working draft

Mutable latest authoring state.

Characteristics:

- debounced/background persistence;
- conflict-safe;
- optimized for frequent saves;
- not shown as dozens of user-visible versions.

### 15.2 Checkpoint

Named or explicit restorable snapshot.

Created by:

- manual `Create checkpoint`;
- meaningful milestones;
- optionally before risky restore/replace operations.

### 15.3 Published version

Immutable public release snapshot.

Publishing must still point to an immutable validated version/snapshot.

### 15.4 Migration constraint

Do not redesign persistence until current PageVersion semantics and API consumers are mapped.

A transitional implementation may retain current explicit Save behavior while adding UI improvements first.

---

## 16. History and recovery UX

Target user-facing states:

- Saved
- Saving
- Unsaved
- Offline/error
- Conflict

History should eventually support:

- time;
- author;
- checkpoint label;
- published marker;
- preview/thumbnail;
- restore.

Restore must create a new current state; it should not destroy historical records.

---

## 17. Page Health

A future Page Health panel should aggregate non-blocking diagnostics.

Categories:

### Responsive

- overflow;
- unsafe fixed width;
- clipped content.

### Accessibility

- missing image alt;
- empty button/link labels;
- heading-order warnings;
- form-label issues when detectable.

### SEO

- missing title/description;
- canonical issues;
- no-index state;
- missing social metadata where supported.

### Performance

- oversized media metadata;
- excessive component count warnings;
- costly extension warnings.

### Publishing

- broken internal page links;
- homepage missing/unpublished;
- invalid navigation targets.

Page Health should use existing domain services where possible rather than duplicating validation in React components.

---

## 18. AI builder direction

AI is intentionally not an early dependency of Builder V2.

AI features should operate through safe domain operations such as:

```text
insertPattern(...)
addNode(...)
moveNode(...)
updateProps(...)
updateStyle(...)
setResponsiveOverride(...)
```

Preferred future capabilities:

- generate a section from a prompt;
- generate a whole starter page from approved components/patterns;
- rewrite text;
- recommend layout fixes;
- fix mobile overflow;
- generate SEO suggestions;
- suggest Brand Kit tokens.

AI MUST NOT bypass validation by directly persisting arbitrary HTML/CSS/script output.

Every AI mutation must pass the same PagePayload and placement validation as a manual mutation.

---

## 19. Command architecture

Builder mutations should converge on a reusable command layer.

Examples:

```text
AddNode
InsertPattern
MoveNode
DuplicateNode
DeleteNode
WrapNode
UpdateNodeProps
UpdateNodeStyle
ResetResponsiveOverride
SetViewportVisibility
```

Canvas, Layers, Quick Add, keyboard shortcuts, context menus, and future AI should call these commands instead of implementing separate mutation logic.

Benefits:

- consistent validation;
- consistent history;
- easier tests;
- easier renderer-backed canvas migration;
- easier AI integration.

---

## 20. Code organization target

The Pages feature now owns its route data and behavior under `apps/cms/app/pages`. The
shared `CmsShell` owns only authentication, workspace context, permissions, and navigation;
it must not become a replacement dashboard coordinator.

Recommended extraction:

```text
apps/cms/app/pages/
  pages-view.tsx
  page-tree.tsx
  page-detail.tsx
  page-create-modal.tsx
  page-settings-drawer.tsx
  page-actions.ts

apps/cms/builder/
  builder-shell.tsx
  builder-command-bus.ts
  builder-state.ts
  builder-selection.ts
  builder-preview-bridge.ts
  builder-renderer-bridge.ts
  builder-adapter.ts
  grapes-editor.tsx
  panels/
    add-panel.tsx
    layers-panel.tsx
    assets-panel.tsx
    patterns-panel.tsx
    inspector-panel.tsx

packages/contracts/
  component-registry.ts
  style-registry.ts
  builder-commands.ts        # only if commands are cross-package domain contracts
```

Exact naming is flexible. Responsibility boundaries are not.

Avoid rebuilding a second monolithic `builder-shell.tsx` containing all panels and property editors.

---

## 21. Research inspirations

These products are references for interaction patterns, not dependencies and not designs to copy literally.

### Webflow

Useful patterns:

- Navigator/tree hierarchy;
- synchronized canvas/Layers selection;
- structured Style panel;
- responsive authoring;
- design variables/components.

Reference:

- https://help.webflow.com/

### Builder.io

Useful patterns:

- Visual Editor layout;
- Insert/Layers separation;
- production-site rendering inside editor workflows;
- content history/checkpoints;
- data/component integration.

Reference:

- https://www.builder.io/c/docs

### GrapesJS

Useful as the current editor engine and for:

- component model;
- canvas/editor commands;
- custom Style Manager UI;
- block/component extension model.

Reference:

- https://grapesjs.com/docs/

### Framer

Useful UX inspiration:

- direct manipulation;
- approachable visual layout controls;
- compact responsive design workflow;
- reusable components/styles.

Reference:

- https://www.framer.com/

The product should combine these interaction lessons with the existing validated PagePayload architecture rather than clone another platform.

---

## 22. Implementation phases

### Phase B0 — Parity foundation

**Goal:** make builder/renderer drift difficult to introduce.

Deliverables:

- centralize style property capability metadata;
- centralize breakpoints;
- exhaustive core renderer registry;
- registry-driven block availability where possible;
- parity/round-trip tests;
- document intentional editor-only previews.

Exit criteria:

- adding a core component without renderer support fails tests/typecheck;
- adding a supported style requires one shared capability definition;
- builder and renderer use the same responsive breakpoint contract.

### Phase B1 — Pages V2

**Goal:** replace resource-inventory mental model with website-management mental model.

Deliverables:

- extract Pages from monolithic dashboard responsibility;
- Site Map Manager UI;
- selected-page detail surface;
- create-page modal;
- compact quick actions;
- homepage/public-path clarity;
- search/filter retained where useful;
- responsive/mobile layout.

Exit criteria:

- user can understand site structure without opening a drawer;
- user can create/open/preview/publish a page in obvious flows;
- existing RBAC and APIs remain respected.

### Phase B2 — Builder shell V2

**Goal:** improve usability without changing PagePayload semantics.

Deliverables:

- activity rail;
- one active left panel;
- resizable/collapsible side panels;
- inspector tabs;
- improved toolbar;
- responsive overlay panels;
- selection breadcrumb;
- preserve current save/history/drag behaviors.

Exit criteria:

- canvas receives the majority of workspace area;
- no page-wide horizontal overflow at supported CMS breakpoints;
- builder remains fully usable with keyboard/mouse.

### Phase B3 — Interaction V2

**Goal:** reduce interaction friction.

Deliverables:

- shared command layer;
- synchronized selection;
- quick-add affordance;
- contextual toolbar;
- refined drag/drop;
- keyboard commands;
- right-click/context menu where valuable;
- inline text editing.

Exit criteria:

- canvas and Layers mutations produce the same validated commands;
- cross-parent moves remain reliable;
- invalid placement is understandable before drop.

### Phase B4 — Layout and component expansion

**Goal:** allow meaningful no-code website construction.

Deliverables:

- semantic layout controls;
- missing flex/grid capabilities;
- Heading/Rich Text/Video/etc. according to priority;
- component registry extensions;
- renderer parity for every new node/style.

Exit criteria:

- common website sections can be built without raw CSS knowledge.

### Phase B5 — Patterns and Brand Kit

**Goal:** speed up creation and improve consistency.

Deliverables:

- Section Library;
- pattern insertion pipeline;
- design tokens/Brand Kit foundation;
- token-aware inspector controls;
- production renderer token resolution.

Exit criteria:

- user can create a coherent multi-section page quickly;
- changing a supported brand token produces consistent rendered changes.

### Phase B6 — Renderer-backed canvas

**Goal:** make builder visual output production-authoritative.

Deliverables:

- renderer selection bridge;
- hover/bounds bridge;
- production canvas mode;
- CMS-owned overlay chrome;
- visible site header/footer/navigation;
- gradual migration of visual editing interactions.

Exit criteria:

- selected core pages can be edited while viewing production renderer output;
- builder preview and published renderer no longer rely on duplicated core component markup.

### Phase B7 — Draft safety and history

**Goal:** reduce fear of editing and data loss.

Deliverables:

- working-draft persistence design;
- autosave or safe incremental save;
- checkpoints;
- improved history UI;
- restore flow;
- conflict recovery improvements.

Exit criteria:

- frequent authoring does not create uncontrolled immutable-version growth;
- restore is safe and reversible.

### Phase B8 — Page Health and AI

**Goal:** assist non-technical users after the core editor is trustworthy.

Deliverables:

- responsive/accessibility/SEO/publishing diagnostics;
- AI operations on validated builder commands;
- section/page generation from registered components/patterns;
- responsive-fix suggestions.

Exit criteria:

- AI cannot persist invalid unsupported PagePayload structures;
- user can inspect/review AI changes before publishing.

---

## 23. Non-goals and constraints

Builder V2 MUST NOT:

1. rename or break canonical public routes;
2. replace Site/Page ownership rules;
3. weaken tenant/workspace isolation;
4. bypass RBAC permissions;
5. persist arbitrary scripts as normal PagePayload content;
6. make GrapesJS project JSON the domain model;
7. couple the production renderer to CMS/editor modules;
8. create a second style/component truth separate from contracts;
9. silently change published content during draft editing;
10. remove backward compatibility without an explicit migration plan.

---

## 24. Required quality gates

Every Builder V2 implementation phase should run the repository's standard quality gates and add targeted coverage.

At minimum:

- format check;
- lint;
- typecheck;
- unit tests;
- contract tests;
- renderer tests;
- relevant API/integration tests;
- Playwright E2E for affected CMS flows.

### 24.1 Required builder E2E scenarios

The suite should progressively cover:

1. create page;
2. open builder;
3. add section/content;
4. edit text;
5. change style;
6. switch responsive viewport;
7. move node within parent;
8. move node across valid parents;
9. reject invalid placement;
10. duplicate/delete;
11. save draft;
12. reload and verify persistence;
13. preview renderer and compare key output;
14. publish;
15. load canonical public route;
16. verify page content and responsive behavior;
17. verify navigation/header/footer when applicable.

### 24.2 Parity regression test requirement

For representative fixtures, the project should be able to assert semantic parity between:

```text
saved PagePayload
    -> preview renderer
    -> published renderer
```

The exact test may use DOM semantics, computed normalized styles, screenshots, or a combination. Avoid brittle pixel-only tests as the sole parity guarantee.

---

## 25. Definition of Done for Builder V2 foundation

The foundation is considered successful when:

- Pages feels like managing a website rather than managing database rows;
- Builder canvas is the visual focus;
- common editing actions require fewer panel hops;
- Layers, canvas, and Inspector remain synchronized;
- responsive overrides are understandable;
- new components/styles cannot be added only to the editor and forgotten in renderer;
- production preview accurately represents published rendering;
- page/site routing remains stable;
- the codebase has clear ownership boundaries instead of further expanding `cms-dashboard.tsx` and `builder-shell.tsx` into monoliths;
- future Patterns, Brand Kit, global components, Page Health, and AI can be added without redesigning the entire editor again.

---

## 26. Final architectural decision

The project will continue to use the current **validated PagePayload architecture** and **GrapesJS editing engine** in the near term.

The next development effort will focus on:

1. **Pages V2 as a Site Map Manager**;
2. **Builder Shell V2 with a simpler no-code UX**;
3. **a strict shared builder/renderer parity contract**;
4. **semantic layout and reusable component/pattern systems**;
5. **a gradual renderer-backed canvas migration**;
6. **safe draft/history architecture before aggressive autosave or AI generation**.

This direction intentionally avoids a high-risk editor rewrite while creating a path toward a production-accurate, extensible website builder suitable for non-technical users.
