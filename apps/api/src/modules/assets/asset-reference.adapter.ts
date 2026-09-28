import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import {
  ASSET_REFERENCE_PORT,
  type AssetReferencePort,
  type AssetReferenceUsage,
} from '../../shared/asset-reference-port';
import { CollectionEntryVersionRecord } from '../../persistence/schemas/collection.schema';
import {
  LayoutExtensionRecord,
  LayoutExtensionVersionRecord,
} from '../../persistence/schemas/layout-extension.schema';
import { PageSeoSettingsRecord } from '../../persistence/schemas/page-seo-settings.schema';
import { PageVersionRecord } from '../../persistence/schemas/page-version.schema';
import { ReusableRecord } from '../../persistence/schemas/reusable.schema';
import { SiteRecord } from '../../persistence/schemas/site.schema';
import {
  TemplateRecord,
  TemplateVersionRecord,
} from '../../persistence/schemas/template.schema';

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

/** Infrastructure scanner for asset references across platform resources. */
@Injectable()
export class AssetReferenceAdapter implements AssetReferencePort {
  constructor(
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

  async scan(
    workspaceId: string,
    assetId: string,
    storageKey: string,
    publicUrl: string | undefined,
    onMatch: (usage: AssetReferenceUsage) => boolean | Promise<boolean>,
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
      throw new ConflictException({
        code: 'ASSET_USAGE_CHECK_INCOMPLETE',
        message: 'Asset usage verification could not be completed safely.',
        details: { source },
      });
    }
  }
}

export const ASSET_REFERENCE_PORT_PROVIDER = {
  provide: ASSET_REFERENCE_PORT,
  useExisting: AssetReferenceAdapter,
} as const;

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
