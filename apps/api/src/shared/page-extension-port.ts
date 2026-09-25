import type {
  PageComposition,
  PagePayload,
  PageRuntimeExtension,
  PublishedPageBundle,
  SiteGlobalPayloadV1,
} from '@payload/contracts';

export const PAGE_EXTENSION_PORT = Symbol('PAGE_EXTENSION_PORT');

/**
 * Narrow Core-owned capability for the optional page extension projection and
 * runtime. Core depends on this port; the Extensions module supplies the
 * implementation at the composition root.
 */
export interface PageExtensionPort {
  synchronizeComposition(
    pageId: string,
    workspaceId: string,
    composition: PageComposition,
    expectedDraftVersionId?: string,
  ): Promise<void>;

  removeAllForPage(pageId: string, workspaceId: string): Promise<void>;

  validateBeforePublish(
    pageId: string,
    workspaceId: string,
    payload: PagePayload,
    composition?: PageComposition,
  ): Promise<void>;

  compilePublishedBundle(
    pageId: string,
    workspaceId: string,
    versionNumber: number,
    payload: PagePayload,
    composition?: PageComposition,
    legacyLayoutAttachments?: PageComposition['layoutAttachments'],
  ): Promise<PublishedPageBundle>;

  afterPublish(pageId: string, workspaceId: string, versionNumber: number): Promise<void>;

  resolveRuntimeForComposition(
    pageId: string,
    workspaceId: string,
    composition: PageComposition,
  ): Promise<PageRuntimeExtension[]>;

  resolveRuntimeForLayoutDocuments(
    workspaceId: string,
    documents: readonly SiteGlobalPayloadV1[],
  ): Promise<PageRuntimeExtension[]>;
}
