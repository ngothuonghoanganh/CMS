# Phase 4 — Visual Builder and Builder Adapter

## Ownership and boundaries

The CMS builder is a protected client-side editor surface. GrapesJS is an editor
engine only; it is not a domain model and its project JSON is never the canonical
persisted page representation.

```text
CMS builder shell
  -> GrapesJS lifecycle/editor state
  -> explicit Builder Adapter
  -> PagePayloadV1 validation
  -> POST /api/v1/pages/:pageId/versions
  -> immutable PageVersion + currentDraftVersionId
```

The adapter lives inside `apps/cms/builder` and is the only place that knows both
the V1 node mapping and the GrapesJS component representation. `packages/contracts`
remains independent of GrapesJS. The API and renderer consume the existing frozen
payload contract.

## V1 mapping and supported canvas

The actual V1 node set is `root`, `section`, `container`, `text`, `image`, and
`button`. The adapter maps those nodes to semantic GrapesJS elements:

| PagePayloadV1 | Editor element | Persisted props             |
| ------------- | -------------- | --------------------------- |
| `root`        | `main`         | children, styles            |
| `section`     | `section`      | children, styles            |
| `container`   | `div`          | children, styles            |
| `text`        | `p`            | text, align, styles         |
| `image`       | `img`          | src, alt, styles            |
| `button`      | `a`            | label, href, target, styles |

Stable page node ids are carried by editor-only data attributes. Newly inserted
nodes receive a page-local id; serialization strips editor-only attributes and
reconstructs the strict V1 union. The style map translates the explicit V1
camelCase properties to CSS property names. `base`, `tablet`, and `mobile` style
objects are preserved in an editor-only responsive metadata attribute and are
validated again when serialized.

Unsupported or malformed editor components fail adapter serialization with a
diagnostic; they are not silently dropped. Unknown V1 fields remain rejected by
the shared schema. Rich HTML, arbitrary CSS, raw GrapesJS project data, and
components not represented by V1 are intentionally unsupported.

The supported hierarchy is `root` → `section`/`container` →
`container`/`text`/`image`/`button`; leaf nodes cannot contain children. The root is
kept non-droppable so GrapesJS cannot introduce an implicit body wrapper.

Blocks have an explicit pointer-drag path from the CMS block panel into the real
canvas iframe. Existing components use the same canvas pointer path and the adapter's
nesting rules to call GrapesJS `Component.move` for reorder/move operations. Dropping a
leaf at the root creates a valid section wrapper. Click-to-add remains available for
keyboard-friendly insertion.

## Drag/drop investigation and decision

The original implementation was verified in Chromium headed mode with both
`Locator.dragTo()` and a real multi-step `page.mouse` sequence. The canvas is a real
iframe, so the block panel and canvas do not share a DOM coordinate space.

The native GrapesJS `BlockManager.startDrag`/canvas sorter was also exercised. It
emitted a drag-start event, but the iframe drop target was not reached and the model
remained unchanged; native component dragging likewise did not reorder components.
This is classified as a GrapesJS integration/iframe-boundary issue, not an adapter or
React state issue. The final interaction layer is therefore a small iframe-aware
bridge: it resolves the browser pointer coordinate with
`Canvas.getMouseRelativeCanvas`, finds the deepest GrapesJS component under the real
canvas element, and mutates the GrapesJS model directly. It never maintains a second
React component tree. Invalid parents and ancestor drops are rejected before calling
`Component.move`.

The browser tests read a development-only serialized snapshot of the live GrapesJS
model after drag operations. This catches the case where the canvas DOM changes but
the model does not. A valid Button block also uses `#section` as its starter link so
the frozen contract's safe-URL validation succeeds on the first serialization.

## Lifecycle and save flow

The server page boundary loads the Page and its current draft version before
the client editor mounts. The client initializes GrapesJS once, hydrates exactly
once, subscribes only to change/selection events, and destroys the editor on
unmount. React owns loading, selected component, viewport, dirty state and save
status; GrapesJS owns its internal component tree. The live GrapesJS tree is the
single editor source of truth; the initial `payload` prop is not used as a second
controlled document.

The builder supports add/select/edit/move/delete/duplicate and undo/redo. The
properties inspector edits text, link/image attributes, alignment and the supported
layout/typography/style fields. Desktop, tablet and mobile viewport changes update the
real iframe canvas and capture base/tablet/mobile style metadata for serialization.

The first Phase 4 save is explicit rather than autosave:

1. serialize the current editor state through the adapter;
2. validate the result with `PagePayloadV1Schema`;
3. send it with the loaded `expectedVersionNumber`;
4. mark the UI `Saved` only after the API returns the new PageVersion;
5. update the local expected version and clear dirty state.

A `409 PAGE_VERSION_CONFLICT` becomes a visible conflict state with a reload
action. The builder never retries using the latest version or overwrites another
editor's changes. Basic before-unload protection covers dirty navigation.

## Assets and templates

The existing workspace asset metadata API is used as a selector for image nodes;
binary upload remains outside this phase. Asset selection only writes a validated
`/assets/` storage reference or safe HTTP(S) source through the adapter. Template
payloads remain starter snapshots, not live inheritance links; any existing
template starter payload can be opened and round-tripped like another V1 payload.

## Authentication boundary

The API uses a short-lived HS256 JWT access token and a cryptographically random
refresh token. Both are `HttpOnly`, `SameSite=Lax` cookies; production also requires
`Secure`. Access claims identify the principal, workspace and refresh session, but the
authentication guard still checks the active persisted session. Refresh tokens are
stored only as SHA-256 hashes in the Mongo `authSessions` collection, with expiry,
revocation and replacement metadata plus a TTL index.

`POST /auth/refresh` atomically revokes the presented session and creates a replacement,
so the old refresh token cannot be replayed. Logout revokes the session and clears both
cookies. The CMS API client performs one single-flight refresh on an expired access
token and retries the original request once; refresh failure redirects to login without
an infinite retry loop. Cookies use `Path=/` so the Next proxy can refresh an expired
access token during navigation; CSRF protection beyond `SameSite` is a future hardening
item outside this phase.

## Tests and known limitations

Pure adapter tests cover hydration, serialization, stable ids, styles, responsive
metadata, supported props, round-trip semantics, invalid/unsupported editor data,
and validation failures. API integration coverage verifies immutable version saves and
stale-write conflicts. Auth/browser integration coverage verifies login, cookie-only
tokens, refresh rotation, stale-token rejection, logout, and the protected builder.
Playwright covers real block drag/drop, canvas reorder, inspector edits, responsive
viewport changes, duplicate/delete/undo/redo, save/reload/second-edit and conflict
feedback.

This phase does not add publishing, public delivery, preview infrastructure, rich
text HTML, media upload/storage, autosave, collaboration, merge logic, a block
registry, or a second payload version. Any V1 limitation is documented here rather
than changed in the frozen contract.

## Phase boundary

Phase 4 is complete for the scoped builder and authentication hardening work. Phase 5
has not been started.

## Validation status

Validated on 2026-08-22:

- `pnpm format:check` — PASS
- `pnpm lint` — PASS
- `pnpm typecheck` — PASS
- `pnpm test` — PASS (7 unit tests pass; 5 Mongo integration tests are intentionally
  skipped without `RUN_MONGO_TESTS=true`)
- `RUN_MONGO_TESTS=true pnpm test` — PASS (12/12 API tests, including immutable saves
  and stale version conflicts)
- `pnpm build` — PASS (CMS builder route remains dynamic and the editor stays in the
  client boundary)
- `pnpm test:e2e` — PASS (18 browser tests, including auth rotation and all builder
  regression flows)
- `pnpm exec playwright test tests/e2e/cms.spec.ts --headed --workers=1 --retries=0` —
  PASS (13/13 builder tests with real Chromium pointer movement)

The local shell uses Node 22.19.0 although repository engines require Node >=24, so
pnpm prints an engine warning; Node 24 LTS is the supported environment. Playwright
also reports the Next development server's localhost/127.0.0.1 cross-origin warning,
without affecting the passing flows. Production identity/session storage, binary asset
storage, and public delivery remain outside this phase.
