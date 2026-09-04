# Page Composition

A page's structure is a **composition**. The visual payload is only the placement
tree; page-owned extension lifecycle/configuration is stored beside it.

```text
PageComposition
  pageId
  payload           (PagePayload — visual body plus optional copied globals)
  attachments       (PageExtensionAttachment — ownership/configuration)
  layoutAttachments (Header/Footer placement)
  bindings          (data sources)
  actions           (runtime actions)
  resources         (extension resources)
```

`PageDocument.composition` contains the fields outside `payload` while the API
`PageComposition` and each new `PageVersion` contain the complete snapshot.
Legacy versions without this field remain readable and are normalized when a
new draft is saved.

## Visual extension nodes

An extension node is a visual placement, not the extension installation. New
Countdown and custom extension nodes carry an `attachmentId` in their props:

```ts
{ type: 'extension', props: { extensionId, attachmentId, values } }
```

The matching attachment owns `enabled`, `configuration`, connections and
resources. The Builder generates a new attachment ID when inserting or
duplicating a visual node; removing the node removes the attachment from the
next saved composition. The same attachment ID is never shared by two visual
nodes.

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
published PageVersion
  → immutable PublishedPageBundle
  → published Header/Footer versions → menus
  → reusables → design tokens → resolved extension runtimes
```

It returns a `PageLayoutComposition`:

```ts
type PageLayoutComposition = {
  header?: { slot: PageLayoutSlot; document: SiteGlobalPayloadV1 };
  footer?: { slot: PageLayoutSlot; document: SiteGlobalPayloadV1 };
};
```

## Preview vs live

- Draft review resolves the current persisted draft version and its composition;
  it does not read the browser's unsaved GrapesJS tree.
- Legacy page fields may still be read for compatibility during draft review,
  but live delivery never resolves mutable page extension state.
- Legacy layout attachments resolve the **draft** Header/Footer document in
  preview and the **published** document in live mode.
- Copied page globals render from the page draft/published payload and are not
  affected by later edits to their source extension.
