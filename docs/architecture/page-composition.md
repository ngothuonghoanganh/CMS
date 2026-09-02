# Page Composition

A page's structure is a **composition**. New Header/Footer usage is stored as
copied global nodes in the page payload; the attachment envelope below remains
for backwards-compatible pages created by the earlier layout flow.

```text
PageComposition
  payload           (PagePayload — body plus optional copied globals)
  layoutAttachments (legacy Header/Footer references)
```

Newly inserted Header/Footer blocks are children of `PagePayload.root`. Legacy
attachment references are still resolved by the public shell.

## Layout attachments

```ts
type PageLayoutAttachment = {
  id: string;
  type: 'header' | 'footer';
  resourceId: string;
  slot:
    | 'page.header.top'
    | 'page.header.top-left'
    | 'page.header.top-right'
    | 'page.footer.bottom';
  enabled: boolean;
};
```

- `top`, `top-left`, `top-right` are **placement of the attachment**, not Header
  styling. Header behaviour (sticky/fixed/transparent-on-scroll) remains a
  property of the Header resource itself.
- Initial implementation allows at most one header and one footer per page, but
  the schema is extensible (announcement bar, secondary header, sidebar, …).

## Public resolution

The public resolver batches:

```text
Page → layout attachments → published Header/Footer versions → menus
     → reusables → design tokens → extensions
```

It returns a `PageLayoutComposition`:

```ts
type PageLayoutComposition = {
  header?: { slot: PageLayoutSlot; document: SiteGlobalPayloadV1 };
  footer?: { slot: PageLayoutSlot; document: SiteGlobalPayloadV1 };
};
```

## Preview vs live

- Legacy attachments resolve the **draft** Header/Footer document in preview and
  the **published** document in live mode.
- Copied page globals render from the page draft/published payload and are not
  affected by later edits to their source extension.
