import type {
  LayoutExtensionKind,
  LayoutExtensionResource,
  PageLayoutAttachment,
  SiteGlobalPayloadV1,
} from '@payload/contracts';

export const PAGE_LAYOUT_PORT = Symbol('PAGE_LAYOUT_PORT');

export type PageLayoutComposition = {
  header?: { slot: string; document: SiteGlobalPayloadV1 };
  footer?: { slot: string; document: SiteGlobalPayloadV1 };
};

/** Narrow layout capabilities required by page validation and delivery. */
export interface PageLayoutPort {
  get(
    siteId: string | undefined,
    workspaceId: string,
    kind: LayoutExtensionKind,
    resourceId: string,
  ): Promise<LayoutExtensionResource>;

  resolveComposition(
    attachments: readonly PageLayoutAttachment[],
    mode: 'draft' | 'published',
    scope?: { workspaceId: string; siteId?: string },
  ): Promise<PageLayoutComposition>;
}
