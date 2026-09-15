# Phase 20 — Collections, Dynamic Data, and Dynamic Pages

## Goals

Phase 20 extends the static Page Builder into a metadata-driven no-code CMS:

```text
Collection definitions -> versioned entries -> bounded queries
                       -> bindings -> Collection List / Dynamic Page
```

Existing Phase 19 layout, template, extension, and published-bundle semantics
remain the source of truth for page composition.

## Delivered architecture

- Shared contracts define collection fields, entries, immutable versions,
  `DataSourceDescriptor`, finite `PageQuery`, safe bindings, and dynamic paths.
- API persistence uses tenant-scoped collection definitions, entry pointers,
  and immutable entry-version records.
- Collection and entry routes enforce workspace/site ownership, permissions,
  optimistic concurrency, validation, usage checks, and audit events.
- Page compositions persist queries and bindings. Published page bundles carry
  the published query/binding configuration, while collection rows resolve at
  runtime from published entry pointers.
- The builder registers `collection-list` with exactly one `collection-item`
  template. The Inspector edits bounded query filters/sorts and dynamic
  property bindings.
- Review uses the saved draft composition and draft entry. Public SSR uses the
  published composition and published entry.
- Dynamic pages reuse Page kind/versioning and resolve `/products/{slug}`-style
  paths against published collection entries.
- The workspace layout owns the authenticated `CmsShell`; feature routes render
  directly beneath it and take collection, entry, site, and page identity from
  route parameters.
- Collection entry forms are generated from field metadata. Asset fields use a
  workspace-scoped asset picker and reference fields use a site-scoped entry
  picker; persisted values remain IDs, not embedded resource objects.
- Page, layout, and template builder routes are explicit full-screen boundaries
  and bypass the management shell. Their leave actions return to the owning
  canonical resource route.

## Review/public semantics

| Resource             | Builder          | Review                           | Public                                   |
| -------------------- | ---------------- | -------------------------------- | ---------------------------------------- |
| Page, query, binding | working draft    | saved draft                      | published bundle                         |
| Collection entry     | draft            | draft                            | published pointer                        |
| Dynamic route        | working metadata | saved dynamic page + draft entry | published dynamic page + published entry |

Publishing an entry updates pages that already query it. Publishing a changed
page query or binding still requires publishing that page.

## Security and safety

The query language is a finite schema. No `eval`, `new Function`, raw MongoDB,
SQL, GraphQL, or user-supplied expressions are accepted. Paths and URLs are
validated, public resolution never falls back to draft data, and all management
operations are tenant-scoped and permission/audit protected.

## Test and quality gates

Focused unit/service/renderer/builder tests cover schema limits, binding
resolution, collection-list repetition, composition round trips, dynamic
metadata, and Phase 19 compatibility. The repository gates are:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check:cms-design-system
pnpm test:e2e:full
```

The dedicated E2E journey should create Products, publish entries, build and
review a filtered list, publish a dynamic detail page, then verify draft/public
separation before and after entry publication.

## Known limitations

Array/group values retain an Advanced JSON editor because those structured
shapes do not have a complete nested form builder in this phase. Asset browsing
is intentionally bounded to server-backed pages and has no bulk operation.
Sitemap enumeration, external data providers, caching, formulas, and
interactive public pagination are intentionally outside this phase.

Closure browser coverage includes canonical root/login redirects, standalone
builder boundaries, semantic entry editing, server-backed asset and reference
pickers, pagination beyond the first asset page, and draft/public collection
resolution. The full Playwright matrix is the required browser gate and is run
as `pnpm exec playwright test` (also exposed in CI through
`pnpm test:e2e:full`); the default `pnpm test:e2e` command remains the faster
non-tenancy smoke subset.
