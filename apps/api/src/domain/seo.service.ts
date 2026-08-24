import { randomUUID } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
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
import { LandingPageRecord } from '../persistence/schemas/landing-page.schema';

@Injectable()
export class SeoService {
  constructor(
    @InjectModel(PageSeoSettingsRecord.name)
    private readonly seoModel: Model<PageSeoSettingsRecord>,
    @InjectModel(LandingPageRecord.name)
    private readonly pageModel: Model<LandingPageRecord>,
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
    await this.requirePage(pageId, workspaceId);
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

  private async requirePage(pageId: string, workspaceId: string): Promise<void> {
    if (!(await this.pageModel.exists({ _id: pageId, workspaceId }))) {
      throw new NotFoundException({
        code: 'PAGE_NOT_FOUND',
        message: 'Landing page was not found in the requested workspace',
      });
    }
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
    });
  }
}
