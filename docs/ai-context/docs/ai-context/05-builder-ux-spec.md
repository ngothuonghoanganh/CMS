# 05 — Visual Builder UX Specification

## 1. UX objective

The builder must make common actions obvious and advanced actions discoverable without overwhelming the user.

The primary interaction loop is:

```text
find/add element → select → edit → move → preview → save → publish
```

Every visual decision should reduce friction in this loop.

## 2. Desktop workspace

Recommended wide layout:

```text
┌──────────────────────────────────────────────────────────────────┐
│ ← Pages   Page name   ● Saved   Desktop Tablet Mobile  Preview Save Publish │
├────────────┬────────────────────────────────┬─────────────────────┤
│ Insert     │                                │ Content             │
│ Layers     │            CANVAS              │ Style               │
│ Assets     │                                │ Advanced            │
│ Pages      │                                │                     │
│            │                                │                     │
└────────────┴────────────────────────────────┴─────────────────────┘
```

The sidebars must be resizable/collapsible within reasonable bounds. Canvas should remain the dominant work area.

## 3. Adaptive workspace

When viewport space is insufficient:

- collapse to a two-panel layout;
- allow left/right inspector to become tabs/drawers;
- never squeeze canvas to an unusable width;
- avoid promising full visual-layout editing on a phone-sized viewport.

Mobile CMS may support content/approval/quick editing without exposing full layout manipulation.

## 4. Left sidebar

Suggested modes:

### Insert

- search components;
- categories;
- recent/favorites later if useful;
- clear draggable affordance;
- component preview/description when needed.

### Layers

Tree representation of page structure.

### Assets

Media/asset picker, upload, search, metadata.

### Pages / navigation

Only if useful in current product architecture; avoid duplicating global CMS navigation unnecessarily.

## 5. Layers specification

Layers are a document tree, not a flat list.

Required interaction targets:

- hierarchy indentation;
- expand/collapse;
- select;
- hover sync with canvas;
- rename inline;
- drag handle;
- before/inside/after insertion indicator;
- auto-scroll during drag;
- auto-expand parent on sustained hover;
- context menu;
- duplicate;
- delete;
- hide/show if supported;
- lock if supported;
- keyboard navigation;
- search/filter;
- virtualized rendering for very large trees.

Canvas selection and layer selection must always agree.

## 6. Canvas interaction

Canvas needs predictable modes and feedback:

- select mode;
- pan/hand mode;
- zoom in/out;
- fit-to-screen;
- reset 100%;
- device/breakpoint selector;
- selection outline;
- hover outline;
- breadcrumbs/path;
- drop indicator;
- parent container highlighting when useful.

Recommended convention: holding Space temporarily activates pan/hand mode if technically compatible.

## 7. Drag/drop feedback

Use distinct semantics:

- line indicator = insert before/after;
- highlighted container = insert inside;
- invalid style/cursor = cannot drop.

The UI must never make users guess where an element will land.

## 8. Inspector structure

Top level:

- Content;
- Style;
- Advanced.

Suggested Style groups:

- Layout;
- Size;
- Spacing;
- Typography;
- Background;
- Border;
- Effects.

Use accordions and optional focus mode so long inspectors do not become endless pages.

## 9. Semantic controls

Property type → recommended control:

| Value           | Control                              |
| --------------- | ------------------------------------ |
| boolean         | Switch                               |
| number          | Numeric input + stepper              |
| dimension       | Number + unit selector               |
| bounded numeric | Number/range                         |
| color           | Swatch + color picker                |
| date            | Calendar picker                      |
| time            | Time picker                          |
| datetime        | Date + time                          |
| enum            | Select                               |
| large enum      | Searchable combobox                  |
| multi value     | Multi-select                         |
| image/media     | Asset picker                         |
| icon            | Icon picker                          |
| URL             | URL field + optional resource picker |
| alignment       | Segmented control                    |
| spacing         | Visual box model control             |
| long text       | Textarea                             |
| code/json       | Advanced code editor only            |

Do not represent all values as text inputs.

## 10. Responsive style editing

The inspector must clearly distinguish:

- inherited/base value;
- current breakpoint override;
- reset override / inherit action.

A user changing mobile should not accidentally mutate desktop unless the property is intentionally shared.

## 11. Save status

Builder header should expose clear states:

- Saved;
- Unsaved changes;
- Saving…;
- Save failed;
- Conflict/reload required.

Do not rely solely on transient toasts for document safety.

## 12. Content-editor mode

Future/target role mode:

Allowed:

- text;
- images/media;
- links;
- form copy/config where permitted;
- SEO/content metadata;
- publish workflow based on permission.

Restricted:

- structural reparenting;
- arbitrary layout/style changes;
- advanced CSS/code;
- destructive component-schema changes.

This makes the platform safer for non-design users.
