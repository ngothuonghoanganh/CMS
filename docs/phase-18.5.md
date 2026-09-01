# Phase 18.5 — Site Global Draft / Published Lifecycle

Phase 18.5 stabilizes the lifecycle of the single logical Global Header and
Global Footer owned by a Site. The implementation keeps the existing
`globalsDraft` and `publishedGlobals` aggregate fields; it does not introduce a
separate global-document collection or duplicate Header/Footer records.

## Domain model

Each resource has an optional draft snapshot and an optional published snapshot.
The effective draft is resolved per resource:

1. An explicitly persisted draft value wins.
2. An omitted draft value inherits a deep clone of the published value.
3. If neither exists, the Builder may create its default document locally.

`header: null` and `footer: null` are explicit removal markers. Omission means
inheritance; null never falls back to the published snapshot. Cloning preserves
all existing node IDs and prevents draft mutation from changing a published
object.

The API derives, rather than persists, these states independently for Header and
Footer:

| Published | Draft   | Meaning                           |
| --------- | ------- | --------------------------------- |
| none      | none    | Never configured                  |
| none      | A       | Draft only                        |
| A         | omitted | Published, implicit editable fork |
| A         | A       | Live, up to date                  |
| A         | B       | Live with unpublished changes     |
| A         | null    | Live with pending removal         |

## Resource lifecycle

- `PATCH /workspaces/:workspaceId/sites/:siteId/globals/header` saves only the
  Header draft and preserves Footer.
- `PATCH .../globals/footer` does the equivalent for Footer.
- `POST .../globals/header/publish` promotes only the effective Header draft.
- `POST .../globals/footer/publish` promotes only the effective Footer draft.
- `POST .../globals/header/discard` removes the persisted Header draft override,
  restoring inheritance from the published Header.
- `POST .../globals/footer/discard` does the equivalent for Footer.
- `POST /workspaces/:workspaceId/sites/:siteId/publish` remains the explicit
  full Site promotion path for existing site-level publishing semantics.

Granular Header/Footer publishing validates the selected resource against the
published Design System. An unpublished design-token dependency produces an
actionable conflict; it is never auto-published as a hidden side effect.

## Builder and rendering

The Builder consumes the API's effective draft and server-derived resource
state. Its status distinguishes:

- `Live · Up to date`
- `Live · Unsaved changes`
- `Live · Draft saved · Not published`
- `Draft · Not published`

The Builder always edits Draft. When a live Header or Footer exists, `Start
Header draft from live` / `Start Footer draft from live` deep-clones the chosen
live snapshot into the local Draft editor. That replacement is not persisted
until `Save draft`; it never writes directly to Live. This lets the author
choose whether to continue the current Draft or begin a fresh Draft from Live.
`Revert … to live version` removes the persisted Draft override and returns to
the live snapshot.

Header/Footer publish buttons are explicit (`Publish Header`, `Publish Footer`).
Preview receives effective draft globals and draft navigation. Public delivery
receives published globals and published navigation only. An explicit null
resource suppresses the legacy navigation fallback for that resource; an
omitted resource can still use the legacy navigation fallback when no custom
global snapshot exists.

## Compatibility and migration

No bulk migration runs. Published-only legacy sites use lazy, read-only
published-to-draft inheritance. Draft-only and dual-snapshot sites continue to
parse through the same aggregate schema. Existing node IDs remain stable.

The canonical E2E fixture resets Header and Footer through the resource-scoped
save/publish lifecycle. It does not delete or create tenants/sites as part of
this phase.
