# Phase 2.1 — Hardening and Contract Stabilization

## What changed

- Clarified metadata ownership: `LandingPage.name` is the CMS management name;
  `PagePayloadV1.metadata.documentTitle` and `documentDescription` are versioned
  rendered-document metadata.
- Removed the duplicated `props.kind` discriminator. Node `type` is the sole
  discriminator and each node has a typed props union.
- Added bounded inputs: 256 KiB serialized payloads, 200 nodes, depth 24, bounded node
  ids/text/URLs/style values.
- Added URL policy that rejects unsafe schemes and narrows image sources to HTTP(S) or
  `/assets/` paths.
- Added offset pagination (`limit`, `offset`) with defaults 20/0, maximum limit 100,
  stable ordering and `{ items, pagination }` responses for page and version lists.
- Replaced the optional LandingPage slug sparse unique index with a partial unique index
  that only applies to string slugs. Missing and null slugs are not unique-key values.
- Expanded real API/Mongo integration tests for ownership, snapshots, pagination,
  validation, deletion, duplicate slugs and the unique PageVersion index.

Existing deployments with the former `siteId_1_slug_1` sparse index need a one-time
index migration: drop that index and let the updated schema create the partial unique
index. This repository does not add a migration framework in Phase 2.1.

## Pagination contract

```http
GET /api/v1/sites/:siteId/pages?limit=20&offset=0
GET /api/v1/pages/:pageId/versions?limit=20&offset=0
```

The response is:

```json
{
  "items": [],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 0,
    "hasNextPage": false
  }
}
```

Page lists order by `createdAt DESC, _id DESC`; version lists order by
`versionNumber DESC, _id DESC`.

## Persistence and concurrency

PageVersion snapshots use `minimize: false` so empty canonical objects such as
`props: {}` survive a Mongo round trip unchanged. The unique
`(landingPageId, versionNumber)` index is enforced by Mongo and duplicate-key errors map
to HTTP 409 `RESOURCE_CONFLICT`.

The save sequence remains intentionally simple:

```text
insert PageVersion
↓
update LandingPage.currentDraftVersionId
```

It is acceptable before autosave/concurrent editing, but it is not transactionally
atomic. Revisit transaction/CAS/idempotency before Phase 4; Phase 2.1 does not add that
complexity.

## Freeze policy

`PagePayloadV1` is now frozen. Persisted V1 payloads remain V1 and unknown fields stay
rejected. Compatible validation bug fixes are allowed. Any incompatible shape or
semantic change requires a new explicit discriminator, such as `PagePayloadV2`, with an
explicit adaptation/migration decision. No migration framework is implemented.
