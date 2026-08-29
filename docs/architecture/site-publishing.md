# Site Publishing

Existing page publishing remains the compatibility boundary: each Page selects
one immutable published PageVersion and public reads never fall back to draft.
Before a page is published, site navigation references are validated against
the same Site and published-page pointers. Invalid references, missing pages,
missing anchors, and inconsistent paths return stable domain errors.

The site manifest endpoint exposes the published route map and navigation ids
without changing the existing Page Payload contract. A future atomic Site
Release can replace those pointers as one release; the current infrastructure
does not yet provide a multi-document transaction, so that is documented
technical debt rather than simulated with a large project blob.

The homepage invariant is enforced by `homePageId`. It is repaired
idempotently for legacy data, cannot be deleted, and can be changed through the
set-homepage operation. Changing home only updates the Site reference; it does
not rewrite the previous or selected Page path. Public resolution is read-only:
legacy repair belongs to an explicit management read or migration job, never to
the delivery path.
