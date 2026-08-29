# Phase 2 — Core Domain and Payload Contract

## Scope

Phase 2 establishes the shared canonical payload, core domain, Mongo persistence and a
small REST API. It does not build CMS management UI, a visual builder or a renderer.

Implemented domain records:

- Workspace
- Site
- Page
- PageVersion
- minimal Asset metadata model
- minimal Template payload model

## Runtime flow

```text
HTTP request
  ↓
Zod runtime validation at controller boundary
  ↓
Nest controller
  ↓
domain service and ownership checks
  ↓
explicit contract mapping
  ↓
Mongoose schema/model
  ↓
MongoDB
```

Page save specifically follows:

```text
PagePayload JSON
  ↓
PagePayloadSchema.parse
  ↓
version/ownership invariants
  ↓
PageVersion snapshot + draft pointer
  ↓
MongoDB
```

## API

All routes are under `/api/v1`:

| Method | Route                                       | Purpose                                         |
| ------ | ------------------------------------------- | ----------------------------------------------- |
| POST   | `/workspaces`                               | Create a workspace                              |
| GET    | `/workspaces/:workspaceId`                  | Read a workspace                                |
| POST   | `/workspaces/:workspaceId/sites`            | Create a site in a workspace                    |
| GET    | `/workspaces/:workspaceId/sites/:siteId`    | Read a site with ownership context              |
| POST   | `/sites/:siteId/pages`                      | Create a page and initial draft version         |
| GET    | `/sites/:siteId/pages?limit=20&offset=0`    | Paginated page list for a site                  |
| GET    | `/pages/:pageId`                            | Read page identity/draft pointer                |
| PATCH  | `/pages/:pageId`                            | Update metadata and/or save a new draft version |
| DELETE | `/pages/:pageId`                            | Hard-delete page and versions                   |
| POST   | `/pages/:pageId/versions`                   | Save a new draft snapshot                       |
| GET    | `/pages/:pageId/versions?limit=20&offset=0` | Paginated version history                       |
| GET    | `/pages/:pageId/versions/:versionNumber`    | Read one snapshot                               |

Invalid input uses the existing error envelope with a specific code where useful, for
example `VALIDATION_ERROR`, `INVALID_PAGE_PAYLOAD`, `PAGE_NOT_FOUND` and
`PAGE_VERSION_CONFLICT`. Authentication is still a seam and routes do not pretend to be
protected by a fake verifier.

## Testing and Playwright

Vitest covers contracts, serialization, resource limits, URL policy, health and version
policy. API integration tests run against real MongoDB and cover ownership, page/version
creation, immutable snapshots, pagination, stale writes, deletion, validation, duplicate
slugs and the unique version index. Playwright
is a root-level infrastructure addition using Chromium only. Its three smoke tests
check CMS shell availability, renderer shell availability and API liveness; it does not
duplicate payload or CRUD logic that belongs in unit/API tests.

The browser configuration starts API, CMS and renderer through `webServer` with explicit
ports and reuses an already-running server locally. CI installs Chromium and runs the
browser smoke suite after build.

## Deferred by design

The following remain outside this phase: CMS page management UI, GrapesJS, builder
adapter, renderer, preview, public routing, publishing, forms/leads, integrations,
feature/extension registry, RBAC, audit trail, soft delete, upload storage and
microservices.
