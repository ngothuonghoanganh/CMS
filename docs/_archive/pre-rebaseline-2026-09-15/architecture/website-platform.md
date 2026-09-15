# Website Platform Architecture

This project models a no-code website as a Site-owned Page graph. Site and
Page are separate resources; page content remains an immutable
`PageVersion`/`PagePayload` snapshot.

## Canonical identity

- `Site.slug` identifies the public platform namespace.
- `Site.homePageId` references the homepage Page.
- `Page.path` is the canonical route identity and is unique within a Site.
- `/` is a Site-level homepage alias. Selecting a new homepage changes only
  `homePageId`; it never changes either Page's `path`.
- `Page.slug`, `landingPageId`, the `landingPages` collection, and the legacy
  `/public/sites/:siteSlug/pages/:pageSlug` APIs remain compatibility fields.

New management writes normalize user-facing URL input at the contracts/API
boundary. Public reads normalize paths and are fail-closed: they select a
published version only and never repair or save tenant data.

## Tenant-safe public routing

```text
platform request /:siteSlug/*path
  → master publicSiteRoutes(siteSlug)
  → tenant id + database key
  → tenant connection
  → Site
  → homePageId for /, Page.path otherwise
  → published PageVersion
```

`publicSiteRoutes` is the control-plane registry. Its globally unique
`siteSlug` maps to `tenantId`, `tenantSlug`, `databaseKey`, `workspaceId`, and
`siteId`. Site create/rename registers the route; bootstrap idempotently
backfills existing Sites. This prevents a platform request from opening the
wrong tenant database based on a tenant-local slug.

Custom domains use the existing verified domain registry and the same resolver.
For a Site-bound domain, `/` resolves through `homePageId`; a legacy Page-bound
domain keeps its assigned Page as the root alias. Unknown, inactive, or
unpublished routes return a generic not-found response.

## Delivery consumers

Navigation stores internal `pageId` references and resolves them to canonical
paths, mapping the homepage reference to `/`. The renderer, form submissions,
analytics events, SEO URL generation, and submission/integration summaries use
`pagePath`. Legacy page-slug reads and payloads are accepted as aliases and do
not replace the canonical path in new records.

## Persistence compatibility

No existing collection is renamed or removed. The new master collection is
`publicSiteRoutes`; tenant persistence continues to use `sites`,
`landingPages`, `pageVersions`, navigation, form, analytics, SEO, domain, and
integration collections. Existing `landingPageId` relationships remain the
stable page foreign key for versions, submissions, analytics, SEO, and form
bindings.

## CMS interaction model

The CMS uses a neutral dark token layer, compact PageHeader/ResourceToolbar
surfaces, table/list inventory views, and right-side drawers for Site/Page
metadata. The builder remains a separate action. Page metadata exposes one
canonical URL slug field; legacy slug storage is not presented as a second
concept to editors.
