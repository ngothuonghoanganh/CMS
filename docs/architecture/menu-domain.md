# Menu Domain

Navigation is **pure menu data**. It has no layout, no renderer and no
draft/published publishing lifecycle of its own.

## What a menu owns

- menu items (page, section, external, action)
- nested children
- label, ordering, visibility metadata, target metadata

## What a menu does NOT own

- Header/Footer layout
- Header/Footer positioning
- a publishing lifecycle
- automatic rendering on every page

## Model

```ts
type Menu = {
  id: string;
  siteId: string;
  workspaceId: string;
  key: string; // e.g. 'main', 'footer'
  name: string;
  items: MenuItem[];
  createdAt: string;
  updatedAt: string;
};
```

`items` is the single source of truth. The previous `draftItems` /
`publishedItems` / `hasUnpublishedChanges` / `publishForSite` /
`validateBeforeSitePublish` / `navigationWarnings` publishing machinery was
removed.

## Rendering

A menu only renders through the `navigation-view` component, which the user
places inside a Header/Footer layout extension (or any document that accepts
it). The component binds a menu by `key` via `props.source` (`main` | `footer`).

`NavigationService.resolveForSite(siteId, workspaceId, { mode })` resolves menu
items into hrefs, where `mode` only selects which **page** version each target
resolves against (`draft` for preview, `published` for live). The menu data
itself has no draft/published state.
