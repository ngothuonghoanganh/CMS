# Dynamic Pages

Dynamic pages reuse the existing Page, PageVersion, PageComposition, layout,
preview, publish, and renderer architecture. They are identified by
`kind: 'dynamic'` plus a collection, lookup field, and controlled path pattern.

```text
Page
  kind: dynamic
  collectionId: Products
  pathPattern: /products/{slug}
  lookupField: slug
```

The path grammar permits static segments and exactly one named parameter. The
API rejects malformed patterns and route conflicts with static pages, another
dynamic page, reserved management paths, and the site root. Dynamic metadata
does not use the legacy static page slug.

Public resolution is:

```text
/products/macbook-pro
  -> published dynamic Page definition
  -> Products entry where published slug = macbook-pro
  -> published PageVersion / PublishedPageBundle
  -> DataContext.currentEntry
  -> SSR renderer
```

No matching published entry returns a safe 404. Draft entries are never
visible on public routes. Review accepts an explicit entry ID and resolves the
saved draft page plus saved draft entry, allowing an editor to review a new
name before publishing it. The public route continues showing the old
published entry until the entry is published.

Dynamic page SEO metadata can use the same finite current-entry binding model
as component properties when the surrounding page metadata supports it. A
future sitemap integration should enumerate published entries only; sitemap
generation is not part of the current route resolver.
