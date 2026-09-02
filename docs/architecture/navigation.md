# Navigation (Menu data)

Navigation is pure menu data owned by a Site. It stores structured nested items;
each internal item stores a `pageId`, never a copied URL string.

Supported targets are:

- Page: resolved from the current Page path; the selected homepage resolves to
  `/` even when its canonical Page path is another path.
- Section: resolved from a Page path plus an anchor id.
- External: validated HTTP(S) URL.
- Action: phone, email, download, or custom action value.

The API validates that internal pages belong to the requested Site and that
section anchors exist in the page's declared anchors or payload node ids. Page
deletion is blocked when a menu still references the page. Nested children use
the same target contract.

Menus have **no** draft/published lifecycle and are **never** rendered
automatically. They render only through the data-bound `navigation-view`
component, which the user places inside a Header/Footer layout extension (or any
document that accepts it). `resolveForSite` turns internal targets into hrefs,
selecting the draft or published page version for preview versus live delivery.
