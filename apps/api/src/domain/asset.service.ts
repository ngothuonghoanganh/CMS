import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
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
import { AssetFolderRecord } from '../persistence/schemas/asset-folder.schema';
import { ASSET_STORAGE, type AssetStorageProvider } from './asset-storage';

const ASSET_USAGE_RESPONSE_LIMIT = 100;

type AssetUsageItem = AssetUsageResponse['items'][number];

type PageVersionUsageRecord = {
  landingPageId: string;
  versionNumber: number;
  payload: unknown;
  composition?: unknown;
};

type EntryVersionUsageRecord = {
  entryId: string;
  versionNumber: number;
  values: unknown;
};

type TemplateUsageRecord = { _id: string };
type TemplateVersionUsageRecord = {
  templateId: string;
  versionNumber: number;
  payload: unknown;
  composition?: unknown;
};
type ReusableUsageRecord = {
  _id: string;
  name: string;
  draft: unknown;
  published?: unknown;
};
type LayoutUsageRecord = { _id: string };
type LayoutVersionUsageRecord = {
  resourceId: string;
  versionNumber: number;
  document: unknown;
};
type SiteUsageRecord = {
  _id: string;
  name: string;
  logo?: unknown;
  globalsDraft?: unknown;
  publishedGlobals?: unknown;
  designSystemDraft?: unknown;
  publishedDesignSystem?: unknown;
};
type SeoUsageRecord = {
  landingPageId: string;
  ogImage?: unknown;
  twitterImage?: unknown;
  favicon?: unknown;
  bindings?: unknown;
};

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
    @InjectModel(AssetFolderRecord.name)
    private readonly folderModel?: Model<AssetFolderRecord>,
    @Inject(ASSET_STORAGE) private readonly storage?: AssetStorageProvider,
  ) {}

  async create(workspaceId: string, input: CreateAssetRequest): Promise<Asset> {
    const record = await this.assetModel.create({
      _id: randomUUID(),
      workspaceId,
      ...input,
    });
    return this.toContract(record);
  }

  async upload(
    workspaceId: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    metadata: {
      title?: string;
      defaultAltText?: string;
      description?: string;
      folderId?: string;
    } = {},
  ): Promise<Asset> {
    if (!this.storage) {
      throw new ConflictException({
        code: 'ASSET_STORAGE_UNAVAILABLE',
        message: 'Asset storage is not configured',
      });
    }
    if (!file || !file.buffer || !Number.isFinite(file.size) || file.size <= 0) {
      throw new ConflictException({
        code: 'ASSET_FILE_REQUIRED',
        message: 'Upload a non-empty file',
      });
    }
    if (file.size > 25 * 1024 * 1024) {
      throw new ConflictException({
        code: 'ASSET_FILE_TOO_LARGE',
        message: 'Files must be 25 MB or smaller',
      });
    }
    if (!SUPPORTED_UPLOAD_MIME_TYPES.has(file.mimetype.toLowerCase())) {
      throw new ConflictException({
        code: 'ASSET_MIME_NOT_ALLOWED',
        message: 'This file type is not supported',
      });
    }
    if (metadata.folderId) await this.assertFolder(workspaceId, metadata.folderId);
    const assetId = randomUUID();
    const filename = safeFilename(file.originalname);
    const storageKey = `${workspaceId}/${assetId}/${filename}`;
    await this.storage.put(storageKey, file.buffer);
    try {
      const record = await this.assetModel.create({
        _id: assetId,
        workspaceId,
        filename,
        mimeType: file.mimetype,
        size: file.size,
        storageKey,
        publicUrl: this.storage.publicUrl(storageKey),
        ...metadata,
      });
      return this.toContract(record);
    } catch (error) {
      await this.storage.delete(storageKey).catch(() => undefined);
      throw error;
    }
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
      ...(query.folderId ? { folderId: query.folderId } : {}),
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

  async readPublic(
    workspaceId: string,
    assetId: string,
  ): Promise<{ asset: Asset; data: Buffer }> {
    if (!this.storage) throw this.notFound(assetId);
    const record = await this.assetModel.findOne({ _id: assetId, workspaceId }).exec();
    if (!record) throw this.notFound(assetId);
    return {
      asset: this.toContract(record),
      data: await this.storage.read(record.storageKey),
    };
  }

  async update(
    workspaceId: string,
    assetId: string,
    input: UpdateAssetRequest,
  ): Promise<Asset> {
    const parsed = UpdateAssetRequestSchema.parse(input);
    const record = await this.assetModel.findOne({ _id: assetId, workspaceId }).exec();
    if (!record) throw this.notFound(assetId);
    for (const field of ['title', 'defaultAltText', 'description', 'folderId'] as const) {
      if (parsed[field] === undefined) continue;
      if (parsed[field] === null) record.set(field, undefined);
      else {
        if (field === 'folderId') await this.assertFolder(workspaceId, parsed[field]);
        record[field] = parsed[field];
      }
    }
    await record.save();
    return this.toContract(record);
  }

  async usages(workspaceId: string, assetId: string): Promise<AssetUsageResponse> {
    const asset = await this.assetModel.findOne({ _id: assetId, workspaceId }).exec();
    if (!asset) throw this.notFound(assetId);
    const references: AssetUsageItem[] = [];
    let matchCount = 0;
    await this.scanAssetReferences(
      workspaceId,
      assetId,
      asset.storageKey,
      asset.publicUrl,
      (usage) => {
        matchCount += 1;
        if (references.length < ASSET_USAGE_RESPONSE_LIMIT) references.push(usage);
        return matchCount > ASSET_USAGE_RESPONSE_LIMIT;
      },
    );

    return AssetUsageResponseSchema.parse({
      assetId,
      workspaceId,
      items: references,
      // This is based on an observed matching reference beyond the response
      // limit, never on an arbitrary source scan limit.
      truncated: matchCount > ASSET_USAGE_RESPONSE_LIMIT,
    });
  }

  async remove(workspaceId: string, assetId: string): Promise<void> {
    await this.assertAssetCanBeDeleted(workspaceId, assetId);
    const asset = await this.assetModel.findOne({ _id: assetId, workspaceId }).exec();
    const result = await this.assetModel.deleteOne({ _id: assetId, workspaceId }).exec();
    if (result.deletedCount === 0) {
      throw this.notFound(assetId);
    }
    if (asset && this.storage)
      await this.storage.delete(asset.storageKey).catch(() => undefined);
  }

  /**
   * Deletion integrity is intentionally separate from the bounded management
   * response. This scan stops only on a proven reference or after every
   * supported source is exhausted; a cursor failure becomes a hard error.
   */
  async assertAssetCanBeDeleted(workspaceId: string, assetId: string): Promise<void> {
    const asset = await this.assetModel.findOne({ _id: assetId, workspaceId }).exec();
    if (!asset) throw this.notFound(assetId);

    let firstUsage: AssetUsageItem | undefined;
    await this.scanAssetReferences(
      workspaceId,
      assetId,
      asset.storageKey,
      asset.publicUrl,
      (usage) => {
        firstUsage = usage;
        return true;
      },
    );
    if (firstUsage) {
      throw new ConflictException({
        code: 'ASSET_IN_USE',
        message: 'This asset is used by another resource and cannot be deleted.',
        details: { usages: [firstUsage], truncated: false },
      });
    }
  }

  private async scanAssetReferences(
    workspaceId: string,
    assetId: string,
    storageKey: string,
    publicUrl: string | undefined,
    onMatch: (usage: AssetUsageItem) => boolean | Promise<boolean>,
  ): Promise<void> {
    const matches = (value: unknown): boolean =>
      containsReference(value, assetId, storageKey, publicUrl);

    if (
      await this.scanCursor(
        'page versions',
        () =>
          this.pageVersionModel
            .find({ workspaceId })
            .select({ landingPageId: 1, versionNumber: 1, payload: 1, composition: 1 })
            .sort({ _id: 1 })
            .lean()
            .cursor() as AsyncIterable<PageVersionUsageRecord>,
        async (version) =>
          matches({ payload: version.payload, composition: version.composition }) &&
          onMatch({
            resourceType: 'page',
            resourceId: version.landingPageId,
            label: `Page ${version.landingPageId}`,
            location: `Version ${version.versionNumber}`,
            versionState: 'historical',
          }),
      )
    )
      return;

    if (
      await this.scanCursor(
        'collection entry versions',
        () =>
          this.entryVersionModel
            .find({ workspaceId })
            .select({ entryId: 1, versionNumber: 1, values: 1 })
            .sort({ _id: 1 })
            .lean()
            .cursor() as AsyncIterable<EntryVersionUsageRecord>,
        async (version) =>
          matches(version.values) &&
          onMatch({
            resourceType: 'collection-entry',
            resourceId: version.entryId,
            label: `Collection entry ${version.entryId}`,
            location: `Version ${version.versionNumber}`,
            versionState: 'historical',
          }),
      )
    )
      return;

    if (
      await this.scanCursor(
        'templates',
        () =>
          this.templateModel
            .find({ workspaceId })
            .select({ _id: 1 })
            .sort({ _id: 1 })
            .lean()
            .cursor() as AsyncIterable<TemplateUsageRecord>,
        async (template) =>
          this.scanCursor(
            'template versions',
            () =>
              this.templateVersionModel
                .find({ templateId: template._id })
                .select({ templateId: 1, versionNumber: 1, payload: 1, composition: 1 })
                .sort({ _id: 1 })
                .lean()
                .cursor() as AsyncIterable<TemplateVersionUsageRecord>,
            async (version) =>
              matches({ payload: version.payload, composition: version.composition }) &&
              onMatch({
                resourceType: 'template',
                resourceId: version.templateId,
                label: `Template ${version.templateId}`,
                location: `Version ${version.versionNumber}`,
                versionState: 'historical',
              }),
          ),
      )
    )
      return;

    if (
      await this.scanCursor(
        'reusables',
        () =>
          this.reusableModel
            .find({ workspaceId })
            .select({ _id: 1, name: 1, draft: 1, published: 1 })
            .sort({ _id: 1 })
            .lean()
            .cursor() as AsyncIterable<ReusableUsageRecord>,
        async (reusable) =>
          matches({ draft: reusable.draft, published: reusable.published }) &&
          onMatch({
            resourceType: 'reusable',
            resourceId: reusable._id,
            label: reusable.name,
            versionState: 'draft',
          }),
      )
    )
      return;

    if (
      await this.scanCursor(
        'layouts',
        () =>
          this.layoutModel
            .find({ workspaceId })
            .select({ _id: 1 })
            .sort({ _id: 1 })
            .lean()
            .cursor() as AsyncIterable<LayoutUsageRecord>,
        async (layout) =>
          this.scanCursor(
            'layout versions',
            () =>
              this.layoutVersionModel
                .find({ resourceId: layout._id })
                .select({ resourceId: 1, versionNumber: 1, document: 1 })
                .sort({ _id: 1 })
                .lean()
                .cursor() as AsyncIterable<LayoutVersionUsageRecord>,
            async (version) =>
              matches(version.document) &&
              onMatch({
                resourceType: 'layout',
                resourceId: version.resourceId,
                label: `Layout ${version.resourceId}`,
                location: `Version ${version.versionNumber}`,
                versionState: 'historical',
              }),
          ),
      )
    )
      return;

    if (
      await this.scanCursor(
        'sites',
        () =>
          this.siteModel
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
            .sort({ _id: 1 })
            .lean()
            .cursor() as AsyncIterable<SiteUsageRecord>,
        async (site) =>
          matches({
            logo: site.logo,
            globalsDraft: site.globalsDraft,
            publishedGlobals: site.publishedGlobals,
            designSystemDraft: site.designSystemDraft,
            publishedDesignSystem: site.publishedDesignSystem,
          }) &&
          onMatch({
            resourceType: 'site',
            resourceId: site._id,
            label: site.name,
            versionState: 'draft',
          }),
      )
    )
      return;

    await this.scanCursor(
      'page SEO settings',
      () =>
        this.seoModel
          .find({ workspaceId })
          .select({
            landingPageId: 1,
            ogImage: 1,
            twitterImage: 1,
            favicon: 1,
            bindings: 1,
          })
          .sort({ _id: 1 })
          .lean()
          .cursor() as AsyncIterable<SeoUsageRecord>,
      async (seo) =>
        matches(seo) &&
        onMatch({
          resourceType: 'page-seo',
          resourceId: seo.landingPageId,
          label: `SEO settings for ${seo.landingPageId}`,
        }),
    );
  }

  private async scanCursor<T>(
    source: string,
    cursorFactory: () => AsyncIterable<T>,
    onRecord: (record: T) => boolean | Promise<boolean>,
  ): Promise<boolean> {
    try {
      for await (const record of cursorFactory()) {
        if (await onRecord(record)) return true;
      }
      return false;
    } catch {
      throw this.usageCheckIncomplete(source);
    }
  }

  private usageCheckIncomplete(source: string): ConflictException {
    return new ConflictException({
      code: 'ASSET_USAGE_CHECK_INCOMPLETE',
      message: 'Asset usage verification could not be completed safely.',
      details: { source },
    });
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
      ...(record.folderId ? { folderId: record.folderId } : {}),
      ...(record.publicUrl ? { publicUrl: record.publicUrl } : {}),
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

  private async assertFolder(workspaceId: string, folderId: string): Promise<void> {
    const folder = await this.folderModel?.findOne({ _id: folderId, workspaceId }).exec();
    if (!folder) {
      throw new ConflictException({
        code: 'ASSET_FOLDER_NOT_FOUND',
        message: 'The selected asset folder was not found in this workspace',
      });
    }
  }
}

const SUPPORTED_UPLOAD_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/svg+xml',
  'video/mp4',
  'video/webm',
  'video/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'application/pdf',
  'application/json',
  'text/plain',
  'text/csv',
]);

function safeFilename(value: string): string {
  const normalized = value
    .normalize('NFKC')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized.slice(0, 180) || 'upload';
}

function containsReference(
  value: unknown,
  assetId: string,
  storageKey: string,
  publicUrl?: string,
): boolean {
  if (typeof value === 'string') {
    return value === assetId || value === storageKey || value === publicUrl;
  }
  if (Array.isArray(value))
    return value.some((item) => containsReference(item, assetId, storageKey, publicUrl));
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((item) =>
      containsReference(item, assetId, storageKey, publicUrl),
    );
  }
  return false;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
