# Extension persistence parity audit

## Verified root causes

1. The Builder inserted a visual `countdown`/`extension` node into GrapesJS, but
   there was no attachment relation in the node and no canonical attachment in
   the page draft.
2. Page versions stored `payload` only. `PageExtensionInstance` was created as
   a side effect and publish compiled from the mutable page instance collection.
3. Draft review and public delivery resolved extension runtime from current page
   state when a published bundle was absent, allowing draft extension state to
   leak into delivery.

## Implemented flow

```text
Builder insert/duplicate
  → visual node + fresh attachmentId
  → PageDocument composition reconciliation
  → POST /pages/:pageId/versions { payload, composition }
  → PageVersion { payload, composition }
  → compatibility PageExtensionInstance projection
  → GET /preview/pages/:pageId reads persisted draft composition
  → publish validates and snapshots the same composition
  → public resolver reads publishedVersionId + PublishedPageBundle only
```

Removing a visual extension node drops its attachment on the next save. A
duplicate receives an independent attachment ID. Legacy payloads without an
attachment ID remain readable and are normalized on save.

## Parity matrix

| Surface        | Source of truth             | Extension runtime source            |
| -------------- | --------------------------- | ----------------------------------- |
| Builder canvas | working `PageDocument`      | working page runtime context        |
| Draft save     | canonical `PageComposition` | version composition                 |
| Review         | current draft `PageVersion` | composition-derived runtime         |
| Publish        | saved draft `PageVersion`   | validated immutable bundle          |
| Public         | `publishedVersionId`        | published bundle; no draft fallback |

## Validation and failure behavior

Publish rejects missing or mismatched attachments, disabled/uninstalled tenant
extensions, missing connections/resources and invalid configuration. Draft save
advances the draft pointer conditionally and compensates the new version if the
compatibility projection fails, so a successful response is not returned for a
partial version write.
