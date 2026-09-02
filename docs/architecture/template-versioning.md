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
- `publish` moves `publishedVersionId` to the latest version.
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
