# Site Publishing

Each Page selects one immutable published `PageVersion`; public reads never fall
back to draft. Publishing a Page validates reusable dependencies, design-token
references, workflow dependencies and page-extension publish constraints before
atomically moving the `publishedVersionId` pointer.

Header, Footer and Template are published independently through their own
resource endpoints; `Publish Site` no longer snapshots navigation structure.
Publishing a referenced Header/Footer propagates through page layout
attachments without republishing any page.

The site manifest endpoint exposes the published route map without changing the
existing Page Payload contract. A future atomic Site Release can replace those
pointers as one release; the current infrastructure does not yet provide a
multi-document transaction, so that is documented technical debt rather than
simulated with a large project blob.

The homepage invariant is enforced by `homePageId`. It is repaired idempotently
for legacy data, cannot be deleted, and can be changed through the set-homepage
operation. Public resolution is read-only: legacy repair belongs to an explicit
management read or migration job, never to the delivery path.
