import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import {
  PageSeoSettingsRecord,
  type PageSeoSettingsDocument,
} from '../../persistence/schemas/page-seo-settings.schema';
import {
  PageVersionRecord,
  type PageVersionDocument,
} from '../../persistence/schemas/page-version.schema';
import { SiteRecord, type SiteDocument } from '../../persistence/schemas/site.schema';
import type {
  AssetReferencePort,
  AssetReferenceUsage,
} from '../../shared/asset-reference-port';

type PageVersionUsage = Pick<
  PageVersionDocument,
  'landingPageId' | 'versionNumber' | 'payload' | 'composition'
>;
type SiteUsage = Pick<
  SiteDocument,
  | '_id'
  | 'name'
  | 'logo'
  | 'globalsDraft'
  | 'publishedGlobals'
  | 'designSystemDraft'
  | 'publishedDesignSystem'
>;
type SeoUsage = Pick<
  PageSeoSettingsDocument,
  'landingPageId' | 'ogImage' | 'twitterImage' | 'favicon' | 'bindings'
>;

/** Core-only asset reference scan for pages, sites and basic SEO metadata. */
@Injectable()
export class CoreAssetReferenceAdapter implements AssetReferencePort {
  constructor(
    @InjectModel(PageVersionRecord.name)
    private readonly pageVersionModel: Model<PageVersionRecord>,
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
        () =>
          this.pageVersionModel
            .find({ workspaceId })
            .select({ landingPageId: 1, versionNumber: 1, payload: 1, composition: 1 })
            .sort({ _id: 1 })
            .lean()
            .cursor() as AsyncIterable<PageVersionUsage>,
        async (version) =>
          matches({ payload: version.payload, composition: version.composition }) &&
          onMatch({
            resourceType: 'page',
            resourceId: version.landingPageId.toString(),
            label: `Page ${version.landingPageId.toString()}`,
            location: `Version ${version.versionNumber}`,
            versionState: 'historical',
          }),
      )
    ) {
      return;
    }

    if (
      await this.scanCursor(
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
            .cursor() as AsyncIterable<SiteUsage>,
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
            resourceId: site._id.toString(),
            label: site.name,
            versionState: 'draft',
          }),
      )
    ) {
      return;
    }

    await this.scanCursor(
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
          .cursor() as AsyncIterable<SeoUsage>,
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
      });
    }
  }
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
  if (Array.isArray(value)) {
    return value.some((item) => containsReference(item, assetId, storageKey, publicUrl));
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((item) =>
      containsReference(item, assetId, storageKey, publicUrl),
    );
  }
  return false;
}
