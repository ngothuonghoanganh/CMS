# Collections

Collections are tenant-scoped, metadata-driven content models. A
`CollectionDefinition` owns stable field keys and validation metadata; a
`CollectionEntry` owns draft and published pointers; and each
`CollectionEntryVersion` stores one immutable values snapshot.

```text
CollectionDefinition
  site/workspace ownership
  stable collection key
  field definitions
  schemaVersion

CollectionEntry
  draftVersionId
  publishedVersionId
  status

CollectionEntryVersion
  entryId
  versionNumber
  values
```

Entries are stored in shared metadata-driven models. The platform does not
create a Mongoose model or database collection from user input. Collection
field types, required values, bounded validation, references, slug metadata,
and index/unique hints are validated by shared contracts and the domain
service.

Schema edits preserve field IDs and technical keys. A field is archived or
blocked when usage checks find a page query, binding, dynamic-page lookup, or
other dependency. Collection deletion is likewise protected when a published
page or dynamic page still depends on it.

## Entry lifecycle

Saving an entry validates its values and creates a new immutable draft version.
Publishing validates that draft version again and advances only the published
pointer. A failed validation leaves the previous published pointer unchanged.
Optimistic version numbers prevent silent concurrent overwrites.

```text
save entry    -> new draft EntryVersion -> draftVersionId
publish entry -> validate draft       -> publishedVersionId
```

Public page rendering reads published pointers only. Review resolves the saved
draft entry, while an unpublished edit never changes public output. Entry
publication can therefore update an already-published page that queries the
entry without requiring a page republish; changing the page query itself is a
page composition change and still requires page publication.

All collection and entry routes require workspace/site ownership, the relevant
collection or entry permission, and an audit event. Cross-tenant references
are rejected server-side.
