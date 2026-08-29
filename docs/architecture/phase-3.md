# Phase 3 — CMS and Page Management

## Implemented scope

- Environment-configured credentials (`AUTH_EMAIL`, `AUTH_PASSWORD`) with constant-time
  password comparison.
- HTTP-only session cookie with expiry, `SameSite=Lax`, production `Secure` flag and
  logout invalidation. Sessions are intentionally in-memory for this phase; an API
  restart expires active sessions.
- `AuthenticationGuard` on management API routes. The authenticated principal carries
  the active workspace id, and services query workspace-owned records with explicit
  ownership filters.
- CMS proxy redirect for unauthenticated browser requests, login form, logout and
  structured API error handling.
- Responsive CMS shell with Dashboard, Sites, Pages, Assets and Templates
  navigation.
- Site list/create/edit, page list/create/metadata edit and draft version
  history. Page metadata remains on `Page`; version snapshots remain immutable
  `PagePayloadV1` records and saves retain `expectedVersionNumber` concurrency checks.
- Asset metadata CRUD. Binary upload, storage, CDN and processing remain deferred.
- Template metadata CRUD over validated `PagePayload` starter snapshots. A template is
  not a page inheritance hierarchy and has no visual editor.
- Typed, replaceable CMS API client using shared response/error contracts and browser
  credentials.
- Loading, empty, validation, submitting, success and structured error states on the
  management surfaces.

## API boundaries

Management routes are under `/api/v1` and require the session cookie or a bearer token.
The liveness and authentication login routes remain public; health readiness reports
MongoDB state. The API returns the existing `{ error: { code, message, requestId } }`
envelope and does not expose internal stack traces.

The current credential setup is deliberately a small single configured principal. Login
creates the initial demo workspace if none exists and reuses the earliest workspace for
the configured principal. Full user persistence, multi-user membership management,
RBAC and workspace switching are not introduced in this phase.

## E2E coverage

Playwright covers protected-route redirect, invalid credentials, valid login/logout,
authenticated API lifecycle, site create/edit, Page create/metadata edit and
draft history visibility. Mongo-backed Vitest integration tests cover workspace scoping,
page/version behavior, validation, pagination, immutable snapshots and concurrency.

## Explicit Phase 4 boundary

No GrapesJS, builder adapter, drag/drop, block registry, preview renderer, public slug
rendering, publishing, forms, leads, integrations, analytics, marketplace, event
sourcing, CQRS or microservices were added. `PagePayloadV1` remains frozen.
