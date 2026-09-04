import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';

import {
  CreateLayoutExtensionRequestSchema,
  LayoutExtensionListResponseSchema,
  LayoutExtensionResourceSchema,
  LayoutExtensionVersionSchema,
  LayoutExtensionVersionsResponseSchema,
  SiteDesignSystemSchema,
  SiteGlobalPayloadV1Schema,
  UpdateLayoutExtensionRequestSchema,
  createDefaultSiteDesignSystem,
  type CreateLayoutExtensionRequest,
  type DuplicateLayoutExtensionRequest,
  type LayoutExtensionKind,
  type LayoutExtensionResource,
  type LayoutExtensionVersion,
  type LayoutExtensionVersionsResponse,
  type PublishLayoutExtensionRequest,
  type SiteDesignSystem,
  type SiteGlobalPayloadV1,
  type UpdateLayoutExtensionRequest,
} from '@payload/contracts';

import {
  LayoutExtensionRecord,
  LayoutExtensionVersionRecord,
  type LayoutExtensionDocument,
  type LayoutExtensionVersionDocument,
} from '../persistence/schemas/layout-extension.schema';
import { NavigationRecord } from '../persistence/schemas/navigation.schema';
import { PageRecord } from '../persistence/schemas/page.schema';
import { SiteRecord } from '../persistence/schemas/site.schema';
import { PageExtensionService } from '../extensions/page-extension.service';
import { ReusableService } from './reusable.service';

/**
 * Header and Footer layout extensions. They share the Page Builder engine but
 * own an independent draft/published lifecycle. Pages reference them via
 * PageLayoutAttachment; publishing here propagates through those references
 * without republishing any page.
 */
@Injectable()
export class LayoutExtensionService {
  constructor(
    @InjectModel(LayoutExtensionRecord.name)
    private readonly resourceModel: Model<LayoutExtensionRecord>,
    @InjectModel(LayoutExtensionVersionRecord.name)
    private readonly versionModel: Model<LayoutExtensionVersionRecord>,
    @InjectModel(SiteRecord.name)
    private readonly siteModel: Model<SiteRecord>,
    @InjectModel(NavigationRecord.name)
    private readonly navigationModel: Model<NavigationRecord>,
    @InjectModel(PageRecord.name)
    private readonly pageModel: Model<PageRecord>,
    @Inject(PageExtensionService)
    private readonly pageExtensions: PageExtensionService,
    @Inject(ReusableService)
    private readonly reusables: ReusableService,
  ) {}

  async list(siteId: string, workspaceId: string, kind: LayoutExtensionKind) {
    await this.requireSite(siteId, workspaceId);
    const records = await this.resourceModel
      .find({ siteId, workspaceId, kind })
      .sort({ createdAt: 1, _id: 1 })
      .exec();
    return LayoutExtensionListResponseSchema.parse({
      items: records.map((record) => this.toResource(record)),
    });
  }

  async get(
    siteId: string,
    workspaceId: string,
    kind: LayoutExtensionKind,
    resourceId: string,
  ): Promise<LayoutExtensionResource> {
    return this.toResource(
      await this.requireResource(siteId, workspaceId, kind, resourceId),
    );
  }

  async create(
    siteId: string,
    workspaceId: string,
    kind: LayoutExtensionKind,
    input: CreateLayoutExtensionRequest,
  ): Promise<LayoutExtensionResource> {
    await this.requireSite(siteId, workspaceId);
    const parsed = CreateLayoutExtensionRequestSchema.parse(input);
    const document = parsed.document ?? createDefaultLayoutDocument(kind, parsed.name);
    const versionId = randomUUID();
    const resource = await this.resourceModel.create({
      _id: randomUUID(),
      workspaceId,
      siteId,
      kind,
      name: parsed.name,
      ...(parsed.description ? { description: parsed.description } : {}),
      draftVersionId: versionId,
    });
    await this.versionModel.create({
      _id: versionId,
      resourceId: resource._id.toString(),
      versionNumber: 1,
      document,
      status: 'draft',
    });
    return this.toResource(resource);
  }

  async update(
    siteId: string,
    workspaceId: string,
    kind: LayoutExtensionKind,
    resourceId: string,
    input: UpdateLayoutExtensionRequest,
  ): Promise<LayoutExtensionResource> {
    const parsed = UpdateLayoutExtensionRequestSchema.parse(input);
    const resource = await this.requireResource(siteId, workspaceId, kind, resourceId);
    if (parsed.document !== undefined && parsed.expectedVersionNumber !== undefined) {
      const latest = await this.latestVersion(resourceId);
      if (!latest || latest.versionNumber !== parsed.expectedVersionNumber) {
        throw this.staleDraft(resource.name);
      }
    }
    if (parsed.name !== undefined) resource.name = parsed.name;
    if (parsed.description !== undefined) {
      if (parsed.description === null) resource.set('description', undefined);
      else resource.description = parsed.description;
    }
    if (parsed.document !== undefined) {
      const document = this.assertDocumentKind(kind, parsed.document);
      // Version documents are immutable. A save therefore creates a new draft
      // snapshot and retires the prior unpublishable draft, while every
      // published snapshot remains available in the version history.
      const previousDraftId = resource.draftVersionId;
      const version = await this.createVersion(resource, document, 'draft');
      resource.draftVersionId = version.id;
      if (previousDraftId) {
        // Keep old snapshots immutable and visible in history. Only the
        // resource pointer changes; the former draft is no longer publishable.
        await this.versionModel
          .updateOne(
            { _id: previousDraftId, resourceId, status: 'draft' },
            { $set: { status: 'archived' } },
          )
          .exec();
      }
    }
    await resource.save();
    return this.toResource(resource);
  }

  async publish(
    siteId: string,
    workspaceId: string,
    kind: LayoutExtensionKind,
    resourceId: string,
    input: PublishLayoutExtensionRequest,
  ): Promise<LayoutExtensionResource> {
    const parsedInput = input;
    const resource = await this.requireResource(siteId, workspaceId, kind, resourceId);
    if (!resource.draftVersionId) {
      throw new ConflictException({
        code: 'LAYOUT_EXTENSION_NO_DRAFT',
        message: 'There is no draft to publish for this layout extension',
      });
    }
    if (resource.draftVersionId === resource.publishedVersionId)
      return this.toResource(resource);
    const draft = await this.versionModel
      .findOne({
        _id: resource.draftVersionId,
        resourceId,
        ...(parsedInput.versionNumber !== undefined
          ? { versionNumber: parsedInput.versionNumber }
          : {}),
      })
      .exec();
    if (!draft) {
      throw new NotFoundException({
        code: 'LAYOUT_EXTENSION_VERSION_NOT_FOUND',
        message: 'The draft version was not found',
      });
    }
    const document = SiteGlobalPayloadV1Schema.parse(draft.document);
    await this.assertPublishDependencies(siteId, workspaceId, document);
    const promoted = await this.resourceModel
      .findOneAndUpdate(
        {
          _id: resourceId,
          siteId,
          workspaceId,
          kind,
          draftVersionId: draft._id.toString(),
        },
        {
          $set: { publishedVersionId: draft._id.toString() },
          $unset: { draftVersionId: 1 },
        },
        { new: true },
      )
      .exec();
    if (!promoted) throw this.staleDraft(resource.name);
    draft.status = 'published';
    await draft.save();
    return this.toResource(promoted);
  }

  async duplicate(
    siteId: string,
    workspaceId: string,
    kind: LayoutExtensionKind,
    resourceId: string,
    input: DuplicateLayoutExtensionRequest,
  ): Promise<LayoutExtensionResource> {
    const source = await this.requireResource(siteId, workspaceId, kind, resourceId);
    const document = await this.resolveDocument(resourceId, 'draft');
    return this.create(siteId, workspaceId, kind, {
      kind,
      name: input.name ?? `${source.name} copy`,
      ...(source.description ? { description: source.description } : {}),
      ...(document ? { document } : {}),
    });
  }

  async discard(
    siteId: string,
    workspaceId: string,
    kind: LayoutExtensionKind,
    resourceId: string,
  ): Promise<LayoutExtensionResource> {
    const resource = await this.requireResource(siteId, workspaceId, kind, resourceId);
    if (resource.draftVersionId) {
      await this.versionModel
        .updateOne(
          { _id: resource.draftVersionId, resourceId, status: 'draft' },
          { $set: { status: 'archived' } },
        )
        .exec();
      resource.set('draftVersionId', undefined);
      await resource.save();
    }
    return this.toResource(resource);
  }

  async remove(
    siteId: string,
    workspaceId: string,
    kind: LayoutExtensionKind,
    resourceId: string,
  ): Promise<void> {
    await this.requireResource(siteId, workspaceId, kind, resourceId);
    const attached = await this.pageModel.exists({
      siteId,
      workspaceId,
      'layoutAttachments.resourceId': resourceId,
    });
    if (attached) {
      throw new ConflictException({
        code: 'LAYOUT_EXTENSION_IN_USE',
        message: 'Detach this layout from every page before deleting it',
      });
    }
    await this.versionModel.deleteMany({ resourceId }).exec();
    await this.resourceModel
      .deleteOne({ _id: resourceId, siteId, workspaceId, kind })
      .exec();
  }

  async listVersions(
    siteId: string,
    workspaceId: string,
    kind: LayoutExtensionKind,
    resourceId: string,
  ): Promise<LayoutExtensionVersionsResponse> {
    await this.requireResource(siteId, workspaceId, kind, resourceId);
    const records = await this.versionModel
      .find({ resourceId })
      .sort({ versionNumber: -1, _id: -1 })
      .exec();
    return LayoutExtensionVersionsResponseSchema.parse({
      items: records.map((record) => this.toVersion(record)),
    });
  }

  /** Resolve the document for a resource, preferring draft for preview. */
  async resolveDocument(
    resourceId: string,
    mode: 'draft' | 'published',
  ): Promise<SiteGlobalPayloadV1 | undefined> {
    const resource = await this.resourceModel.findOne({ _id: resourceId }).exec();
    if (!resource) return undefined;
    const versionId =
      mode === 'draft'
        ? (resource.draftVersionId ?? resource.publishedVersionId)
        : resource.publishedVersionId;
    if (!versionId) return undefined;
    const version = await this.versionModel
      .findOne({ _id: versionId, resourceId })
      .exec();
    return version ? SiteGlobalPayloadV1Schema.parse(version.document) : undefined;
  }

  /**
   * Resolve the enabled layout attachments of a page into a composition in one
   * batched query, so the public renderer never performs per-attachment reads.
   */
  async resolveComposition(
    attachments: readonly {
      type: 'header' | 'footer';
      resourceId: string;
      slot: string;
      enabled: boolean;
    }[],
    mode: 'draft' | 'published',
    scope?: { siteId: string; workspaceId: string },
  ): Promise<{
    header?: { slot: string; document: SiteGlobalPayloadV1 };
    footer?: { slot: string; document: SiteGlobalPayloadV1 };
  }> {
    const enabled = attachments.filter((attachment) => attachment.enabled);
    const header = enabled.find((attachment) => attachment.type === 'header');
    const footer = enabled.find((attachment) => attachment.type === 'footer');
    const resourceIds = [header?.resourceId, footer?.resourceId].filter(
      (id): id is string => typeof id === 'string',
    );
    if (resourceIds.length === 0) return {};
    const resources = await this.resourceModel
      .find({
        _id: { $in: resourceIds },
        ...(scope ? { siteId: scope.siteId, workspaceId: scope.workspaceId } : {}),
      })
      .exec();
    const byId = new Map(
      resources.map((resource) => [resource._id.toString(), resource]),
    );
    const result: {
      header?: { slot: string; document: SiteGlobalPayloadV1 };
      footer?: { slot: string; document: SiteGlobalPayloadV1 };
    } = {};
    if (header) {
      const document = await this.resolveDocumentFromResource(
        byId.get(header.resourceId),
        mode,
      );
      if (document) result.header = { slot: header.slot, document };
    }
    if (footer) {
      const document = await this.resolveDocumentFromResource(
        byId.get(footer.resourceId),
        mode,
      );
      if (document) result.footer = { slot: footer.slot, document };
    }
    return result;
  }

  private async resolveDocumentFromResource(
    resource: LayoutExtensionDocument | undefined,
    mode: 'draft' | 'published',
  ): Promise<SiteGlobalPayloadV1 | undefined> {
    if (!resource) return undefined;
    const versionId =
      mode === 'draft'
        ? (resource.draftVersionId ?? resource.publishedVersionId)
        : resource.publishedVersionId;
    if (!versionId) return undefined;
    const version = await this.versionModel
      .findOne({ _id: versionId, resourceId: resource._id.toString() })
      .exec();
    return version ? SiteGlobalPayloadV1Schema.parse(version.document) : undefined;
  }

  private async createVersion(
    resource: LayoutExtensionDocument,
    document: SiteGlobalPayloadV1,
    status: 'draft' | 'published',
  ): Promise<LayoutExtensionVersion> {
    const latest = await this.versionModel
      .findOne({ resourceId: resource._id.toString() })
      .sort({ versionNumber: -1 })
      .select({ versionNumber: 1 })
      .exec();
    const versionNumber = (latest?.versionNumber ?? 0) + 1;
    const record = await this.versionModel.create({
      _id: randomUUID(),
      resourceId: resource._id.toString(),
      versionNumber,
      document,
      status,
    });
    return this.toVersion(record);
  }

  private async latestVersion(
    resourceId: string,
  ): Promise<LayoutExtensionVersionDocument | null> {
    return this.versionModel
      .findOne({ resourceId })
      .sort({ versionNumber: -1, _id: -1 })
      .exec();
  }

  private staleDraft(resourceName: string): ConflictException {
    return new ConflictException({
      code: 'LAYOUT_EXTENSION_VERSION_CONFLICT',
      message: `This ${resourceName} was updated elsewhere. Reload the latest draft before saving again.`,
    });
  }

  private async assertPublishDependencies(
    siteId: string,
    workspaceId: string,
    document: SiteGlobalPayloadV1,
  ): Promise<void> {
    const site = await this.siteModel.findOne({ _id: siteId, workspaceId }).exec();
    const designSystem: SiteDesignSystem = site?.publishedDesignSystem
      ? SiteDesignSystemSchema.parse(site.publishedDesignSystem)
      : createDefaultSiteDesignSystem();
    await this.reusables.assertDesignTokenDependenciesAvailableForValues(designSystem, [
      document,
    ]);
    await this.assertMenuReferencesAvailable(siteId, workspaceId, document);
    await this.pageExtensions.validateVisualDocumentDependencies(workspaceId, document);
  }

  private async assertMenuReferencesAvailable(
    siteId: string,
    workspaceId: string,
    document: SiteGlobalPayloadV1,
  ): Promise<void> {
    const keys = collectMenuKeys(document.root);
    if (keys.size === 0) return;
    const navigations = await this.navigationModel
      .find({ siteId, workspaceId, key: { $in: [...keys] } })
      .select({ key: 1 })
      .exec();
    const existing = new Set(navigations.map((record) => record.key));
    const missing = [...keys].filter((key) => !existing.has(key));
    if (missing.length > 0) {
      throw new ConflictException({
        code: 'LAYOUT_EXTENSION_MENU_UNAVAILABLE',
        message: 'The layout extension references a navigation menu that does not exist',
        details: { menuKeys: missing },
      });
    }
  }

  private assertDocumentKind(
    kind: LayoutExtensionKind,
    document: SiteGlobalPayloadV1,
  ): SiteGlobalPayloadV1 {
    const expected = kind === 'header' ? 'site-header' : 'site-footer';
    if (document.documentKind !== expected) {
      throw new ConflictException({
        code: 'INVALID_LAYOUT_EXTENSION_DOCUMENT',
        message: `A ${kind} document must use documentKind ${expected}`,
      });
    }
    return document;
  }

  private async requireSite(siteId: string, workspaceId: string): Promise<void> {
    const exists = await this.siteModel.exists({ _id: siteId, workspaceId });
    if (!exists) {
      throw new NotFoundException({
        code: 'SITE_NOT_FOUND',
        message: `Site ${siteId} was not found`,
      });
    }
  }

  private async requireResource(
    siteId: string,
    workspaceId: string,
    kind: LayoutExtensionKind,
    resourceId: string,
  ): Promise<LayoutExtensionDocument> {
    const record = await this.resourceModel
      .findOne({ _id: resourceId, siteId, workspaceId, kind })
      .exec();
    if (!record) {
      throw new NotFoundException({
        code: 'LAYOUT_EXTENSION_NOT_FOUND',
        message: `Layout extension ${resourceId} was not found in this site`,
      });
    }
    return record;
  }

  private toResource(record: LayoutExtensionDocument): LayoutExtensionResource {
    return LayoutExtensionResourceSchema.parse({
      id: record._id.toString(),
      workspaceId: record.workspaceId,
      siteId: record.siteId,
      kind: record.kind,
      name: record.name,
      ...(record.description ? { description: record.description } : {}),
      ...(record.draftVersionId ? { draftVersionId: record.draftVersionId } : {}),
      ...(record.publishedVersionId
        ? { publishedVersionId: record.publishedVersionId }
        : {}),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }

  private toVersion(record: LayoutExtensionVersionDocument): LayoutExtensionVersion {
    return LayoutExtensionVersionSchema.parse({
      id: record._id.toString(),
      resourceId: record.resourceId,
      versionNumber: record.versionNumber,
      document: record.document,
      status: record.status,
      createdAt: record.createdAt.toISOString(),
      ...(record.createdBy ? { createdBy: record.createdBy } : {}),
    });
  }
}

function createDefaultLayoutDocument(
  kind: LayoutExtensionKind,
  name: string,
): SiteGlobalPayloadV1 {
  const documentKind = kind === 'header' ? 'site-header' : 'site-footer';
  const rootType = kind === 'header' ? 'global-header' : 'global-footer';
  return SiteGlobalPayloadV1Schema.parse({
    version: 1,
    documentKind,
    metadata: { documentTitle: `${name} ${kind}` },
    root: {
      id: 'root',
      type: 'root',
      props: {},
      children: [
        {
          id: `default-${kind}-node`,
          type: rootType,
          props: kind === 'header' ? { position: 'static' } : {},
          children: [],
        },
      ],
    },
  });
}

function collectMenuKeys(
  node: { type: string; props: Record<string, unknown>; children: unknown[] },
  keys: Set<string> = new Set(),
): Set<string> {
  if (node.type === 'navigation-view' && typeof node.props.source === 'string') {
    keys.add(node.props.source);
  }
  node.children.forEach((child) => {
    if (child && typeof child === 'object' && 'type' in child && 'children' in child) {
      collectMenuKeys(
        child as { type: string; props: Record<string, unknown>; children: unknown[] },
        keys,
      );
    }
  });
  return keys;
}
