import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';

import {
  AssetListResponseSchema,
  AssetListQuerySchema,
  AssetSchema,
  AssetUsageResponseSchema,
  UpdateAssetRequestSchema,
  type Asset,
  type AssetListResponse,
  type AssetListQuery,
  type CreateAssetRequest,
  type AssetUsageResponse,
  type UpdateAssetRequest,
} from '@payload/contracts';

import { AssetRecord, type AssetDocument } from '../persistence/schemas/asset.schema';
import { PageVersionRecord } from '../persistence/schemas/page-version.schema';
import { CollectionEntryVersionRecord } from '../persistence/schemas/collection.schema';
import {
  LayoutExtensionRecord,
  LayoutExtensionVersionRecord,
} from '../persistence/schemas/layout-extension.schema';
import {
  TemplateRecord,
  TemplateVersionRecord,
} from '../persistence/schemas/template.schema';
import { ReusableRecord } from '../persistence/schemas/reusable.schema';
import { PageSeoSettingsRecord } from '../persistence/schemas/page-seo-settings.schema';
import { SiteRecord } from '../persistence/schemas/site.schema';

@Injectable()
export class AssetService {
  constructor(
    @InjectModel(AssetRecord.name)
    private readonly assetModel: Model<AssetRecord>,
    @InjectModel(PageVersionRecord.name)
    private readonly pageVersionModel: Model<PageVersionRecord>,
    @InjectModel(CollectionEntryVersionRecord.name)
    private readonly entryVersionModel: Model<CollectionEntryVersionRecord>,
    @InjectModel(TemplateVersionRecord.name)
    private readonly templateVersionModel: Model<TemplateVersionRecord>,
    @InjectModel(TemplateRecord.name)
    private readonly templateModel: Model<TemplateRecord>,
    @InjectModel(ReusableRecord.name)
    private readonly reusableModel: Model<ReusableRecord>,
    @InjectModel(LayoutExtensionVersionRecord.name)
    private readonly layoutVersionModel: Model<LayoutExtensionVersionRecord>,
    @InjectModel(LayoutExtensionRecord.name)
    private readonly layoutModel: Model<LayoutExtensionRecord>,
    @InjectModel(SiteRecord.name)
    private readonly siteModel: Model<SiteRecord>,
    @InjectModel(PageSeoSettingsRecord.name)
    private readonly seoModel: Model<PageSeoSettingsRecord>,
  ) {}

  async create(workspaceId: string, input: CreateAssetRequest): Promise<Asset> {
    const record = await this.assetModel.create({
      _id: randomUUID(),
      workspaceId,
      ...input,
    });
    return this.toContract(record);
  }

  async list(workspaceId: string, input: AssetListQuery): Promise<AssetListResponse> {
    const query = AssetListQuerySchema.parse(input);
    const filter: Record<string, unknown> = {
      workspaceId,
      ...(query.search
        ? { filename: { $regex: escapeRegex(query.search), $options: 'i' } }
        : {}),
      ...(query.mediaType
        ? { mimeType: { $regex: `^${query.mediaType}/`, $options: 'i' } }
        : {}),
    };
    const [records, total] = await Promise.all([
      this.assetModel
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(query.offset)
        .limit(query.limit)
        .exec(),
      this.assetModel.countDocuments(filter).exec(),
    ]);

    return AssetListResponseSchema.parse({
      items: records.map((record) => this.toContract(record)),
      pagination: {
        limit: query.limit,
        offset: query.offset,
        hasNextPage: query.offset + records.length < total,
        total,
      },
    });
  }

  async getById(workspaceId: string, assetId: string): Promise<Asset> {
    const record = await this.assetModel.findOne({ _id: assetId, workspaceId }).exec();
    if (!record) {
      throw this.notFound(assetId);
    }
    return this.toContract(record);
  }

  async update(
    workspaceId: string,
    assetId: string,
    input: UpdateAssetRequest,
  ): Promise<Asset> {
    const parsed = UpdateAssetRequestSchema.parse(input);
    const record = await this.assetModel.findOne({ _id: assetId, workspaceId }).exec();
    if (!record) throw this.notFound(assetId);
    for (const field of ['title', 'defaultAltText', 'description'] as const) {
      if (parsed[field] === undefined) continue;
      if (parsed[field] === null) record.set(field, undefined);
      else record[field] = parsed[field];
    }
    await record.save();
    return this.toContract(record);
  }

  async usages(workspaceId: string, assetId: string): Promise<AssetUsageResponse> {
    const asset = await this.assetModel.findOne({ _id: assetId, workspaceId }).exec();
    if (!asset) throw this.notFound(assetId);
    const references: AssetUsageResponse['items'] = [];
    const add = (
      resourceType: string,
      resourceId: string,
      label: string,
      location?: string,
      versionState?: 'draft' | 'published' | 'historical',
    ) => {
      if (references.length >= 100) return;
      references.push({
        resourceType,
        resourceId,
        label,
        ...(location ? { location } : {}),
        ...(versionState ? { versionState } : {}),
      });
    };
    const matches = (value: unknown): boolean =>
      containsReference(value, assetId, asset.storageKey);

    const pageVersions = await this.pageVersionModel
      .find({ workspaceId })
      .select({ landingPageId: 1, versionNumber: 1, payload: 1, composition: 1 })
      .limit(5000)
      .lean()
      .exec();
    for (const version of pageVersions) {
      if (matches({ payload: version.payload, composition: version.composition })) {
        add(
          'page',
          version.landingPageId,
          `Page ${version.landingPageId}`,
          `Version ${version.versionNumber}`,
          'historical',
        );
      }
    }

    const entryVersions = await this.entryVersionModel
      .find({ workspaceId })
      .select({ entryId: 1, versionNumber: 1, values: 1 })
      .limit(5000)
      .lean()
      .exec();
    for (const version of entryVersions) {
      if (matches(version.values)) {
        add(
          'collection-entry',
          version.entryId,
          `Collection entry ${version.entryId}`,
          `Version ${version.versionNumber}`,
          'historical',
        );
      }
    }

    const templates = await this.templateModel
      .find({ workspaceId })
      .select({ _id: 1 })
      .limit(5000)
      .lean()
      .exec();
    const templateIds = templates.map((template) => template._id);
    const templateVersions = templateIds.length
      ? await this.templateVersionModel
          .find({ templateId: { $in: templateIds } })
          .select({ templateId: 1, versionNumber: 1, payload: 1, composition: 1 })
          .limit(5000)
          .lean()
          .exec()
      : [];
    for (const version of templateVersions) {
      if (matches({ payload: version.payload, composition: version.composition })) {
        add(
          'template',
          version.templateId,
          `Template ${version.templateId}`,
          `Version ${version.versionNumber}`,
          'historical',
        );
      }
    }

    const reusables = await this.reusableModel
      .find({ workspaceId })
      .select({ _id: 1, name: 1, draft: 1, published: 1 })
      .limit(5000)
      .lean()
      .exec();
    for (const reusable of reusables) {
      if (matches({ draft: reusable.draft, published: reusable.published })) {
        add('reusable', reusable._id.toString(), reusable.name, undefined, 'draft');
      }
    }

    const layouts = await this.layoutModel
      .find({ workspaceId })
      .select({ _id: 1 })
      .limit(5000)
      .lean()
      .exec();
    const layoutIds = layouts.map((layout) => layout._id);
    const layoutVersions = layoutIds.length
      ? await this.layoutVersionModel
          .find({ resourceId: { $in: layoutIds } })
          .select({ resourceId: 1, versionNumber: 1, document: 1 })
          .limit(5000)
          .lean()
          .exec()
      : [];
    for (const version of layoutVersions) {
      if (matches(version.document)) {
        add(
          'layout',
          version.resourceId,
          `Layout ${version.resourceId}`,
          `Version ${version.versionNumber}`,
          'historical',
        );
      }
    }

    const sites = await this.siteModel
      .find({ workspaceId })
      .select({
        _id: 1,
        name: 1,
        logo: 1,
        globalsDraft: 1,
        publishedGlobals: 1,
        designSystemDraft: 1,
        publishedDesignSystem: 1,
      })
      .limit(5000)
      .lean()
      .exec();
    for (const site of sites) {
      if (
        matches({
          logo: site.logo,
          globalsDraft: site.globalsDraft,
          publishedGlobals: site.publishedGlobals,
          designSystemDraft: site.designSystemDraft,
          publishedDesignSystem: site.publishedDesignSystem,
        })
      ) {
        add('site', site._id, site.name, undefined, 'draft');
      }
    }

    const seoSettings = await this.seoModel
      .find({ workspaceId })
      .select({ landingPageId: 1, ogImage: 1, twitterImage: 1, favicon: 1, bindings: 1 })
      .limit(5000)
      .lean()
      .exec();
    for (const seo of seoSettings) {
      if (matches(seo)) {
        add('page-seo', seo.landingPageId, `SEO settings for ${seo.landingPageId}`);
      }
    }
    return AssetUsageResponseSchema.parse({
      assetId,
      workspaceId,
      items: references,
      truncated:
        references.length >= 100 &&
        (pageVersions.length >= 5000 ||
          entryVersions.length >= 5000 ||
          templateVersions.length >= 5000 ||
          layoutVersions.length >= 5000 ||
          reusables.length >= 5000 ||
          sites.length >= 5000 ||
          seoSettings.length >= 5000),
    });
  }

  async remove(workspaceId: string, assetId: string): Promise<void> {
    const usage = await this.usages(workspaceId, assetId);
    if (usage.items.length > 0) {
      throw new ConflictException({
        code: 'ASSET_IN_USE',
        message: `This asset is used by ${usage.items.length}${usage.truncated ? '+' : ''} resources.`,
        details: { usages: usage.items, truncated: usage.truncated },
      });
    }
    const result = await this.assetModel.deleteOne({ _id: assetId, workspaceId }).exec();
    if (result.deletedCount === 0) {
      throw this.notFound(assetId);
    }
  }

  private toContract(record: AssetDocument): Asset {
    return AssetSchema.parse({
      createdAt: record.createdAt.toISOString(),
      filename: record.filename,
      ...(record.title ? { title: record.title } : {}),
      ...(record.defaultAltText ? { defaultAltText: record.defaultAltText } : {}),
      ...(record.description ? { description: record.description } : {}),
      id: record._id.toString(),
      mimeType: record.mimeType,
      size: record.size,
      storageKey: record.storageKey,
      updatedAt: record.updatedAt.toISOString(),
      workspaceId: record.workspaceId,
    });
  }

  private notFound(assetId: string): NotFoundException {
    return new NotFoundException({
      code: 'ASSET_NOT_FOUND',
      message: `Asset ${assetId} was not found`,
    });
  }
}

function containsReference(value: unknown, assetId: string, storageKey: string): boolean {
  if (typeof value === 'string') return value === assetId || value === storageKey;
  if (Array.isArray(value))
    return value.some((item) => containsReference(item, assetId, storageKey));
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((item) =>
      containsReference(item, assetId, storageKey),
    );
  }
  return false;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
