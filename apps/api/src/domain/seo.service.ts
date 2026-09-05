import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  PageSeoSettingsSchema,
  UpdatePageSeoSettingsRequestSchema,
  type PageSeoSettings,
  type UpdatePageSeoSettingsRequest,
} from '@payload/contracts';

import {
  PageSeoSettingsRecord,
  type PageSeoSettingsDocument,
} from '../persistence/schemas/page-seo-settings.schema';
import { PageRecord } from '../persistence/schemas/page.schema';
import { CollectionService } from './collection.service';

@Injectable()
export class SeoService {
  constructor(
    @InjectModel(PageSeoSettingsRecord.name)
    private readonly seoModel: Model<PageSeoSettingsRecord>,
    @InjectModel(PageRecord.name)
    private readonly pageModel: Model<PageRecord>,
    @Inject(CollectionService)
    private readonly collections: CollectionService,
  ) {}

  async get(pageId: string, workspaceId: string): Promise<PageSeoSettings> {
    await this.requirePage(pageId, workspaceId);
    const record = await this.seoModel
      .findOne({ landingPageId: pageId, workspaceId })
      .exec();
    return this.toContract(pageId, workspaceId, record);
  }

  async update(
    pageId: string,
    workspaceId: string,
    input: UpdatePageSeoSettingsRequest,
  ): Promise<PageSeoSettings> {
    const page = await this.requirePage(pageId, workspaceId);
    const parsedInput = UpdatePageSeoSettingsRequestSchema.parse(input);
    const set: Record<string, unknown> = {};
    const unset: Record<string, 1> = {};
    const nullableFields = [
      'title',
      'description',
      'canonicalUrl',
      'ogTitle',
      'ogDescription',
      'ogImage',
      'twitterCard',
      'twitterTitle',
      'twitterDescription',
      'twitterImage',
      'favicon',
    ] as const;

    for (const field of nullableFields) {
      const value = parsedInput[field];
      if (value === null || value === '') {
        unset[field] = 1;
      } else if (value !== undefined) {
        set[field] = value;
      }
    }
    if (parsedInput.noIndex !== undefined) set.noIndex = parsedInput.noIndex;
    if (parsedInput.noFollow !== undefined) set.noFollow = parsedInput.noFollow;
    if (parsedInput.bindings !== undefined) {
      if (page.kind !== 'dynamic' || !page.collectionId) {
        throw new BadRequestException({
          code: 'SEO_BINDINGS_REQUIRE_DYNAMIC_PAGE',
          message: 'Collection SEO bindings are only available on dynamic pages',
        });
      }
      const collection = await this.collections.get(
        workspaceId,
        page.siteId,
        page.collectionId,
      );
      for (const [target, binding] of Object.entries(parsedInput.bindings)) {
        const fieldKey = binding.source.path.split('.')[0];
        if (
          !collection.fields.some(
            (field) => field.key === fieldKey && field.status === 'active',
          )
        ) {
          throw new BadRequestException({
            code: 'SEO_BINDING_FIELD_NOT_FOUND',
            message: `SEO binding ${target} references an unavailable collection field`,
            target,
            fieldKey,
          });
        }
        if (
          target.toLowerCase().includes('image') &&
          binding.fallback !== undefined &&
          !isSafeMetadataUrl(binding.fallback)
        ) {
          throw new BadRequestException({
            code: 'SEO_BINDING_FALLBACK_INVALID',
            message: `${target} SEO fallbacks must use http(s) or a safe relative path`,
          });
        }
      }
      if (Object.keys(parsedInput.bindings).length === 0) unset.bindings = 1;
      else set.bindings = parsedInput.bindings;
    }
    const setOnInsert = {
      _id: randomUUID(),
      landingPageId: pageId,
      workspaceId,
      ...(parsedInput.noIndex === undefined ? { noIndex: false } : {}),
      ...(parsedInput.noFollow === undefined ? { noFollow: false } : {}),
    };

    const record = await this.seoModel
      .findOneAndUpdate(
        { landingPageId: pageId, workspaceId },
        {
          $set: set,
          $unset: unset,
          $setOnInsert: setOnInsert,
        },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: false },
      )
      .exec();

    return this.toContract(pageId, workspaceId, record);
  }

  private async requirePage(pageId: string, workspaceId: string): Promise<PageRecord> {
    const page = await this.pageModel.findOne({ _id: pageId, workspaceId }).exec();
    if (!page) {
      throw new NotFoundException({
        code: 'PAGE_NOT_FOUND',
        message: 'Page was not found in the requested workspace',
      });
    }
    return page;
  }

  private toContract(
    pageId: string,
    workspaceId: string,
    record: PageSeoSettingsDocument | null,
  ): PageSeoSettings {
    return PageSeoSettingsSchema.parse({
      pageId,
      workspaceId,
      ...(record?.title ? { title: record.title } : {}),
      ...(record?.description ? { description: record.description } : {}),
      ...(record?.canonicalUrl ? { canonicalUrl: record.canonicalUrl } : {}),
      noIndex: record?.noIndex ?? false,
      noFollow: record?.noFollow ?? false,
      ...(record?.ogTitle ? { ogTitle: record.ogTitle } : {}),
      ...(record?.ogDescription ? { ogDescription: record.ogDescription } : {}),
      ...(record?.ogImage ? { ogImage: record.ogImage } : {}),
      ...(record?.twitterCard ? { twitterCard: record.twitterCard } : {}),
      ...(record?.twitterTitle ? { twitterTitle: record.twitterTitle } : {}),
      ...(record?.twitterDescription
        ? { twitterDescription: record.twitterDescription }
        : {}),
      ...(record?.twitterImage ? { twitterImage: record.twitterImage } : {}),
      ...(record?.favicon ? { favicon: record.favicon } : {}),
      ...(record?.bindings ? { bindings: record.bindings } : {}),
    });
  }
}

function isSafeMetadataUrl(value: string): boolean {
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
