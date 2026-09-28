import { ConflictException, Injectable } from '@nestjs/common';
import {
  PageCompositionSchema,
  PublishedPageBundleSchema,
  type PageComposition,
  type PagePayload,
  type PageRuntimeExtension,
  type ResolvedDataContext,
  type ResolvedDataRecord,
  type SiteDesignSystem,
  type SiteGlobalPayloadV1,
  type LayoutExtensionKind,
  type LayoutExtensionResource,
  type PageLayoutAttachment,
  type Collection,
  type CollectionEntryResponse,
  type PublishedPageBundle,
} from '@payload/contracts';
import type { PageCollectionPort } from '../../shared/page-collection-port';
import type { PageExtensionPort } from '../../shared/page-extension-port';
import type { PageLayoutPort } from '../../shared/page-layout-port';
import type { PageReusablePort } from '../../shared/page-reusable-port';

/**
 * Core feature modules use these implementations when the optional platform is
 * not composed into the application. They intentionally support the standard
 * page path and fail closed when a document requires a deferred capability.
 */

@Injectable()
export class CorePageExtensionAdapter implements PageExtensionPort {
  async synchronizeComposition(
    pageId: string,
    workspaceId: string,
    composition: PageComposition,
  ): Promise<void> {
    void pageId;
    void workspaceId;
    this.assertSupported(composition, composition.layoutAttachments);
  }

  async removeAllForPage(pageId: string, workspaceId: string): Promise<void> {
    void pageId;
    void workspaceId;
  }

  async validateBeforePublish(
    pageId: string,
    workspaceId: string,
    payload: PagePayload,
    composition?: PageComposition,
  ): Promise<void> {
    void pageId;
    void workspaceId;
    this.assertPayloadSupported(payload);
    this.assertSupported(composition, composition?.layoutAttachments);
  }

  async compilePublishedBundle(
    pageId: string,
    workspaceId: string,
    versionNumber: number,
    payload: PagePayload,
    composition?: PageComposition,
    legacyLayoutAttachments?: PageComposition['layoutAttachments'],
  ): Promise<PublishedPageBundle> {
    void workspaceId;
    this.assertPayloadSupported(payload);
    this.assertSupported(
      composition,
      composition?.layoutAttachments ?? legacyLayoutAttachments,
    );
    const normalized = PageCompositionSchema.parse({
      pageId,
      payload,
      ...(composition ?? {}),
      ...(legacyLayoutAttachments && !composition?.layoutAttachments
        ? { layoutAttachments: legacyLayoutAttachments }
        : {}),
    });

    return PublishedPageBundleSchema.parse({
      bundleVersion: 1,
      pageId,
      versionNumber,
      payload,
      attachments: normalized.attachments,
      layoutAttachments: normalized.layoutAttachments,
      bindings: normalized.bindings,
      actions: normalized.actions,
      resources: normalized.resources,
      queries: normalized.queries,
      extensions: [],
      extensionVersions: {},
      capabilities: [],
      runtimeIds: [],
      styleAssetIds: [],
      compiledAt: new Date().toISOString(),
    });
  }

  async afterPublish(
    pageId: string,
    workspaceId: string,
    versionNumber: number,
  ): Promise<void> {
    void pageId;
    void workspaceId;
    void versionNumber;
  }

  async resolveRuntimeForComposition(
    pageId: string,
    workspaceId: string,
    composition: PageComposition,
  ): Promise<PageRuntimeExtension[]> {
    void pageId;
    void workspaceId;
    this.assertSupported(composition, composition.layoutAttachments);
    return [];
  }

  async resolveRuntimeForLayoutDocuments(
    workspaceId: string,
    documents: readonly SiteGlobalPayloadV1[],
  ): Promise<PageRuntimeExtension[]> {
    void workspaceId;
    if (documents.length > 0) throw deferredCapability('extension');
    return [];
  }

  private assertSupported(
    composition: PageComposition | undefined,
    layoutAttachments: readonly PageLayoutAttachment[] | undefined,
  ): void {
    if (
      composition?.attachments.length ||
      composition?.actions.length ||
      composition?.resources.length ||
      layoutAttachments?.length
    ) {
      throw deferredCapability('extension');
    }
  }

  private assertPayloadSupported(payload: PagePayload): void {
    if (containsNodeType(payload.root, new Set(['extension', 'countdown']))) {
      throw deferredCapability('extension');
    }
  }
}

@Injectable()
export class CorePageLayoutAdapter implements PageLayoutPort {
  async get(
    siteId: string | undefined,
    workspaceId: string,
    kind: LayoutExtensionKind,
    resourceId: string,
  ): Promise<LayoutExtensionResource> {
    void siteId;
    void workspaceId;
    void kind;
    void resourceId;
    throw deferredCapability('layout');
  }

  async resolveComposition(
    attachments: readonly PageLayoutAttachment[],
    mode: 'draft' | 'published',
    scope?: { workspaceId: string; siteId?: string },
  ): Promise<{
    header?: { slot: string; document: SiteGlobalPayloadV1 };
    footer?: { slot: string; document: SiteGlobalPayloadV1 };
  }> {
    void mode;
    void scope;
    if (attachments.length > 0) throw deferredCapability('layout');
    return {};
  }
}

@Injectable()
export class CorePageReusableAdapter implements PageReusablePort {
  async assertDependenciesAvailable(
    workspaceId: string,
    siteId: string,
    payload: PagePayload,
  ): Promise<void> {
    void workspaceId;
    void siteId;
    if (containsNodeType(payload.root, new Set(['reusable-instance']))) {
      throw deferredCapability('reusable');
    }
  }

  async assertDesignTokenDependenciesAvailable(
    workspaceId: string,
    siteId: string,
    designSystem: SiteDesignSystem,
    additionalValues: readonly unknown[] = [],
  ): Promise<void> {
    void workspaceId;
    void siteId;
    void designSystem;
    if (
      additionalValues.some((value) =>
        containsNodeType(value, new Set(['reusable-instance'])),
      )
    ) {
      throw deferredCapability('reusable');
    }
  }

  async resolveForPayload(
    workspaceId: string,
    siteId: string,
    payload: PagePayload,
    published: boolean,
  ) {
    void workspaceId;
    void siteId;
    void published;
    if (containsNodeType(payload.root, new Set(['reusable-instance']))) {
      throw deferredCapability('reusable');
    }
    return [];
  }
}

@Injectable()
export class CorePageCollectionAdapter implements PageCollectionPort {
  async get(
    workspaceId: string,
    siteId: string | undefined,
    collectionId: string,
  ): Promise<Collection> {
    void workspaceId;
    void siteId;
    void collectionId;
    throw deferredCapability('collection');
  }

  async getEntry(
    workspaceId: string,
    siteId: string | undefined,
    collectionId: string,
    entryId: string,
    mode?: 'draft' | 'published',
  ): Promise<CollectionEntryResponse> {
    void workspaceId;
    void siteId;
    void collectionId;
    void entryId;
    void mode;
    throw deferredCapability('collection');
  }

  async validateComposition(
    workspaceId: string,
    siteId: string | undefined,
    composition: PageComposition,
  ): Promise<void> {
    void workspaceId;
    void siteId;
    if (composition.queries.length || composition.bindings.some(isCollectionBinding)) {
      throw deferredCapability('collection');
    }
  }

  async resolveDataContext(
    workspaceId: string,
    siteId: string | undefined,
    composition: PageComposition,
    options: { mode: 'draft' | 'published'; currentEntry?: ResolvedDataRecord },
  ): Promise<ResolvedDataContext> {
    void workspaceId;
    void siteId;
    void options;
    if (composition.queries.length || composition.bindings.some(isCollectionBinding)) {
      throw deferredCapability('collection');
    }
    return { queryItems: {}, variables: {} };
  }

  async resolvePublishedEntryByValue(
    workspaceId: string,
    siteId: string | undefined,
    collectionId: string,
    field: string,
    value: string,
  ): Promise<ResolvedDataRecord | null> {
    void workspaceId;
    void siteId;
    void collectionId;
    void field;
    void value;
    throw deferredCapability('collection');
  }
}

function isCollectionBinding(binding: unknown): boolean {
  if (!binding || typeof binding !== 'object') return false;
  const source = (binding as { source?: unknown }).source;
  return (
    !!source &&
    typeof source === 'object' &&
    (source as { type?: unknown }).type === 'collection'
  );
}

function containsNodeType(value: unknown, types: ReadonlySet<string>): boolean {
  if (Array.isArray(value)) return value.some((item) => containsNodeType(item, types));
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (typeof record.type === 'string' && types.has(record.type)) return true;
  return Object.values(record).some((item) => containsNodeType(item, types));
}

function deferredCapability(capability: string): ConflictException {
  const label = capability[0]?.toUpperCase() + capability.slice(1);
  return new ConflictException({
    code: `${capability.toUpperCase()}_PLATFORM_REQUIRED`,
    message: `${label} platform capability is required for this document`,
  });
}
