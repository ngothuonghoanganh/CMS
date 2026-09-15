# Template Versioning

Design Templates are immutable, versioned starter snapshots.

## Model

```ts
type DesignTemplate = {
  id: string;
  workspaceId: string;
  siteId?: string;
  name: string;
  description?: string;
  latestVersionId: string;
  publishedVersionId?: string;
  createdAt: string;
  updatedAt: string;
};

type DesignTemplateVersion = {
  id: string;
  templateId: string;
  versionNumber: number;
  payload: PagePayload;
  layoutAttachments?: PageLayoutAttachment[];
  createdAt: string;
  createdBy?: string;
};
```

The resource contract denormalizes the latest draft `payload` and
`layoutAttachments` for listing convenience; authoritative immutable data lives
in `TemplateVersion` records.

## Versioning

- Creating a template creates version 1 (draft).
- Saving a new payload creates a new version (never overwrites an existing
  version).
- `publish` validates dependencies and moves `publishedVersionId` to the selected
  version (latest by default).
- Old versions are immutable.

## Apply = clone

Applying a template clones its payload and attachment configuration into an
independent Page. There is **no live link**: editing the template never mutates
pages already created from it.

- `PagePayload` is deep-cloned.
- Attachment configuration is copied; `resourceId` stays referenced (Header
  and Footer are not copied into the page).
- `appliedTemplate` provenance metadata is recorded for audit/UI only and is
  never used for sync.

## API

```
GET    /sites/:siteId/templates
POST   /sites/:siteId/templates
GET    /templates/:id
PATCH  /templates/:id
DELETE /templates/:id
GET    /templates/:id/versions
GET    /templates/:id/versions/:versionNumber
POST   /templates/:id/publish
POST   /templates/:id/apply
```

The CMS Template Builder uses the same GrapesJS adapter, Layers, Inspector,
responsive viewport controls, asset/design-token catalogs, undo/redo and
conflict-aware save flow as the Page Builder. It persists the canonical
`PagePayload` plus the template's Header/Footer attachment snapshot; browser-only
editor state is never stored.

`Review draft` reloads the persisted current version before remounting the
editor. Version history can open any saved version for review through the
`?version=` builder query; restoring it creates a new version rather than
overwriting history.
