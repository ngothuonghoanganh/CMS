# Site Publishing

Each Page selects one immutable published `PageVersion`; public reads never fall
back to draft. Publishing reads the saved draft composition, validates reusable
dependencies, design-token references, workflow dependencies, attachment/node
matching, tenant enablement, configuration, connections and page-extension
publish constraints, then compiles the complete immutable `PublishedPageBundle`
before moving the `publishedVersionId` pointer.

The published bundle includes the version payload, extension/layout attachments,
bindings, queries, actions, resources, resolved runtimes, capability identifiers
and extension versions. Public resolution uses that bundle (or an empty
extension set for an old version without a bundle); it never falls back to the
mutable page-extension projection or draft page composition.

Collection entry values remain separately versioned. A public query resolves
only published entry pointers, so publishing an entry can update an already
published page while editing an entry remains private. Query/filter/binding
configuration changes are page composition changes and require page publish.

Header, Footer and Template are published independently through their own
resource endpoints; `Publish Site` no longer snapshots navigation structure.
Publishing a referenced Header/Footer propagates through page layout
attachments without republishing any page.

The public route emits a Header/Footer only when the published page composition
contains an enabled explicit attachment. Preview resolves the persisted draft
layout version, so a saved layout draft is reviewable without becoming live.

The site manifest endpoint exposes the published route map without changing the
existing Page Payload contract. A future atomic Site Release can replace those
pointers as one release; the current infrastructure does not yet provide a
multi-document transaction, so that is documented technical debt rather than
simulated with a large project blob.

The homepage invariant is enforced by `homePageId`. It is repaired idempotently
for legacy data, cannot be deleted, and can be changed through the set-homepage
operation. Public resolution is read-only: legacy repair belongs to an explicit
management read or migration job, never to the delivery path.
