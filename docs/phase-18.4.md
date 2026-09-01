# Phase 18.4 — Navigation publishing semantics

## Problem

Page publication previously called site-wide navigation validation. That
validation required every page referenced by a menu to have a
`publishedVersionId`, so an unrelated draft page could block publishing the
page the editor was working on. A draft target is a normal lifecycle state,
not an invalid navigation reference.

## Domain model

Navigation is a site-level publishable resource:

```text
NavigationRecord
├── draftItems       editable structure
├── publishedItems   last Site Publish snapshot
└── publishedAt
```

`items` remains a compatibility alias for older clients and records. A legacy
record containing only `items` is read as both `draftItems` and
`publishedItems`. New records write `draftItems` only; `publishedItems` stays
absent until the first Site Publish. Updates never mutate the published
structure.

Site Publish validates that draft references are structurally valid and belong
to the same site, then snapshots every site navigation's draft structure. A
target page without a published version is reported as a non-blocking warning
count and remains hidden publicly. Missing pages, wrong-site references,
duplicate item IDs, invalid actions, and invalid URLs remain hard validation
errors.

## Resolution modes

| Navigation structure   | Page version                       | Preview  | Public   |
| ---------------------- | ---------------------------------- | -------- | -------- |
| draftItems             | current draft (published fallback) | visible  | not used |
| publishedItems         | published version                  | not used | visible  |
| publishedItems         | no published version               | not used | hidden   |
| publishedItems section | missing published anchor           | not used | hidden   |

The resolver uses page IDs and computes the current canonical path at runtime;
it does not snapshot paths or rendered HTML. This preserves automatic menu
appearance after Page Publish and automatic disappearance after Page Unpublish
without another Site Publish. A hidden parent hides its subtree, while a live
parent retains only children that are publicly resolvable.

Preview and public page contracts use the same resolver for main and footer
navigation. Global Header and Global Footer remain render-only consumers and
do not own page publication validation.

## Lifecycle decisions

- Page Publish no longer scans unrelated navigation targets.
- Page Unpublish is allowed and dynamically hides its published navigation
  items.
- Deleting a referenced page remains blocked by
  `PAGE_REFERENCED_BY_NAVIGATION`.
- Draft section references validate against the current draft version when
  saved. Public section references validate against the published version and
  stale anchors are omitted rather than emitted as broken links.
- New navigation is intentionally not live until Site Publish. Legacy
  `items`-only navigation remains live through compatibility normalization.

## CMS behavior

The Navigation view reads `draftItems` and shows derived target status for
internal items (`Live`, `Draft — hidden from live site until published`, or
`Missing target`). It also indicates when the menu structure has unpublished
changes. These statuses are derived from the existing page list and are not
persisted in navigation items.

## Regression coverage

Unit coverage verifies draft targets do not block Site Publish, missing targets
still fail, preview/public mode separation, structure snapshotting, warning
counts, and legacy normalization. The dedicated
`tests/e2e/navigation-publishing.spec.ts` exercises the canonical environment,
public renderer DOM, Builder Preview, dynamic Page Publish/Unpublish visibility,
draft structure isolation, and subsequent Site Publish promotion.
