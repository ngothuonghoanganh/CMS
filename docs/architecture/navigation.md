# Navigation

Navigation is a Site-owned aggregate, not Page content. A Navigation stores
structured nested items and each internal item stores a `pageId`, never a copied
URL string.

Supported targets are:

- Page: resolved from the current Page path; the selected homepage resolves to
  `/` even when its canonical Page path is another path.
- Section: resolved from a Page path plus an anchor id.
- External: validated HTTP(S) URL.
- Action: phone, email, download, or custom action value.

The API validates that internal pages belong to the requested Site and that
section anchors exist in the page's declared anchors or payload node ids. Page
deletion is blocked when a navigation still references the page, preventing
dangling links. Nested children use the same target contract.

Published public page responses may contain resolved main/footer navigation. The
renderer treats these as global site chrome and keeps them outside the page
payload, so a shared header/footer is not duplicated in every Page document.
