# Phase 5 — Renderer and Publishing Foundation

## Status

Phase 5 implements the first production delivery boundary. `PagePayloadV1` remains
the canonical structured page representation and is consumed by the renderer without
any GrapesJS, Next.js, React, Mongoose or MongoDB dependency in the shared contract.

## Renderer boundary

```text
published PageVersion.payload
        ↓
PublicPage response
        ↓
PagePayloadV1Schema validation
        ↓
explicit renderer registry
        ↓
semantic React/HTML output
```

The renderer lives in `apps/renderer`. It maps the frozen V1 node set explicitly:

| PagePayloadV1 node | Output    |
| ------------------ | --------- |
| `root`             | `main`    |
| `section`          | `section` |
| `container`        | `div`     |
| `text`             | `p`       |
| `image`            | `img`     |
| `button`           | `a`       |

The renderer never imports GrapesJS or the CMS builder. Text is rendered as text, not
as persisted HTML. Invalid payload data gets a generic safe fallback; API-side
published-payload validation logs a server error without exposing persistence details.

## Styles, responsive behavior and assets

The renderer translates the explicit V1 style vocabulary into React inline styles. It
emits a renderer-generated stylesheet for structured `tablet` and `mobile` overrides:

- base styles are the default;
- `tablet` overrides apply at `max-width: 991px`;
- `mobile` overrides apply at `max-width: 479px`.

Only known style properties are emitted. Values containing CSS delimiters or active
URL/script expressions are omitted. Button URLs are checked again at the renderer
boundary, and `_blank` links receive `noopener noreferrer`. Images use the persisted
`src` and `alt` values directly; V1 supports HTTP(S) and `/assets/` references. Binary
asset upload and storage/CDN processing remain outside this phase.

## Publication model

`Page` now has two management pointers:

```text
currentDraftVersionId
publishedVersionId?
```

`PageVersion` remains an immutable payload snapshot. Creating a new draft only updates
`currentDraftVersionId`; it never changes `publishedVersionId`. The authenticated
management endpoints are:

```text
POST /api/v1/pages/:pageId/publish
POST /api/v1/pages/:pageId/unpublish
```

Publish defaults to the current draft pointer and can select a valid version number.
The API verifies page/version/site/workspace ownership server-side and requires a page
slug before publishing. Unpublish removes the published pointer. No publication state
is stored in `PagePayloadV1`.

## Public routing and preview

Public delivery uses:

```text
GET /api/v1/public/sites/:siteSlug/pages/:pageSlug
GET http://renderer/:siteSlug/:pageSlug
```

Only the published pointer is resolved. Missing, unknown and unpublished pages return
404; there is no draft fallback. The public DTO contains only site/page public names and
slugs plus the published payload, not workspace ids, page ids, version history or
management metadata.

Existing site slugs are unique per workspace, not globally. Since this phase does not
have hostname/custom-domain identity, an ambiguous site slug across workspaces returns
404 rather than selecting an arbitrary tenant. Custom-domain resolution is deferred.

Draft preview uses the same renderer at `/preview/:pageId`. The renderer forwards the
authenticated session cookie to `GET /api/v1/preview/pages/:pageId`; the API requires
the management authentication guard and resolves `currentDraftVersionId`. In the local
setup the CMS, renderer and API share the `127.0.0.1` host. A multi-host deployment must
configure an appropriate shared cookie domain or add a future short-lived preview-token
boundary.

Page metadata maps `payload.metadata.documentTitle` and
`payload.metadata.documentDescription` to Next metadata. Preview pages are marked
`noindex,nofollow`.

## Tests

- `apps/renderer/app/renderer.spec.tsx` covers node mapping, nesting, image/link
  semantics, responsive styles and safe invalid/unsafe data handling.
- API Mongo integration tests cover publish V1, draft isolation, selected-version
  republish, unpublish 404, authenticated preview, public DTO boundaries and workspace
  isolation.
- `tests/e2e/publishing.spec.ts` covers CMS save/publish, public rendering, draft
  isolation, republish and unpublish status behavior.

## Known limitations and Phase 6 boundary

There is no binary upload pipeline, custom-domain provisioning, redirects after slug
changes, cache/CDN layer, email/SMS, social integrations, analytics, experimentation,
plugin/marketplace support or billing. Forms and submissions are implemented in
[`phase-6.md`](phase-6.md); notifications and integrations remain deferred.

`PagePayloadV1` is unchanged by this phase; publication metadata is management-domain
state and the renderer adapts to the existing contract.
