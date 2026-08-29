# Site and Page Model

## Audit findings

The existing domain is workspace-scoped and already separates site identity,
Page metadata, immutable page versions, and the frozen `PagePayload` contract.
`Page` is the canonical business entity for this upgrade; storage compatibility
details are documented below.

Before this change:

```text
Workspace → Site → Page → PageVersion → PagePayload
```

Sites did not own a homepage pointer. Pages used an optional slug, the public
resolver selected a page by that slug, and custom domains were assigned to a
page. There was no first-class navigation aggregate.

## Decision

```text
Workspace / Company
        └── Site
             ├── Page (Page collection)
             ├── Navigation
             ├── Domains
             └── Site settings
```

There is one Site architecture. A single-page website is a Site with one Page;
adding another Page does not change the Site type or require a conversion.

`Site.homePageId` is the only homepage source of truth. UI code derives
`page.id === site.homePageId`; no `Page.isHome` field is used.

Page `path` is the canonical route identity. The existing `slug` field and
request property are retained as a compatibility alias for existing clients.
New writes normalize slugs into paths, and public resolution prefers `path`
before falling back to a legacy slug.

Page versions, publication pointers, extensions, forms, analytics, and the
frozen Page Payload contracts stay on the existing entities. This avoids a
second document system and preserves existing integrations.

## Migration strategy

The migration is idempotent and lazy-safe. New sites create a draft Home Page
and set `homePageId` in the same application operation. Existing sites are
repaired by explicit management reads: an existing `/` page is selected first,
then the oldest existing page is promoted to `/`, and only a site with no pages
gets a new empty Home Page and version 1. Public delivery is read-only and does
not perform this repair. The original page payload and version documents are
never rewritten or deleted.

The Mongoose `homePageId`, `path`, `status`, and hierarchy fields are optional
at persistence level during the compatibility window, while API contracts
return normalized values. This allows old tenant databases to be re-run safely.

The canonical general metadata contract is `Page`: `name` is the existing
title-compatible field, `description` is optional, `path` is the canonical URL,
and `slug` remains a legacy URL alias. SEO is still stored in the existing
per-page SEO entity. Content is the ordered, versioned `PagePayload` tree rather
than a second dynamic-zone document model.

## Future extension points

`parentId`, page kind/status, Navigation targets, site manifest, and site-level
URL resolution prepare for nested pages, global components, redirects,
localization, and atomic site releases without introducing a single-page versus
multi-page branch.
