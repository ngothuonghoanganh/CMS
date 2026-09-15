# Site Routing

## Public resolution flow

```text
HTTP request
  → custom hostname resolver, or master PublicSiteRoute(siteSlug)
  → tenant context + tenant database connection
  → Site
  → Site.homePageId for `/`, otherwise normalized Page.path
  → published PageVersion
  → PagePayload
  → renderer
```

`normalizePagePath` trims whitespace, adds a leading slash, collapses duplicate
slashes, lowercases paths, removes a non-root trailing slash, and rejects query
strings, fragments, backslashes, whitespace, and unsafe characters. The root
path is always `/`.

Pages are unique by `(siteId, path)`. The Mongo index is partial during legacy
migration so old slug-only records remain readable; all new API writes have a
canonical path.

`Site.homePageId` is the only homepage identity. `/` is a site-level alias and
never requires changing the selected Page's canonical path. Platform host
routing is control-plane data in `publicSiteRoutes`, keyed by the globally
unique public `siteSlug`. This lookup happens before tenant models are opened,
so tenant-local Site ids can safely overlap.

The management API exposes a path resolver in addition to the legacy
`/public/sites/:siteSlug/pages/:pageSlug` endpoint. The legacy endpoint remains
available for existing renderer clients and resolves through the canonical path
when possible.

The public renderer supports both platform routes (`/:siteSlug` and
`/:siteSlug/*path`) and custom-domain routes (`/` and `/*path`) through the same
resolver. Custom-domain lookup is fail-closed and always checks the resolved
site, workspace, page, and published version together.

The old `/public/sites/:siteSlug/pages/:pageSlug` read and form endpoints remain
available as compatibility shims. New renderer form requests and analytics
events send `pagePath`; old `pageSlug` payloads are normalized and resolved as
legacy aliases.

## URL policy

`SiteUrlService` is the single official URL resolver. It uses an active primary
site domain, or a legacy primary domain assigned to the homepage, and otherwise
uses the configured platform origin plus the site slug after the homepage is
published. Production domains are never hardcoded in CMS or renderer code.

The same resolver is used for the CMS View Site action and page canonical URL
fallbacks. Preview remains a separate authenticated draft URL.
