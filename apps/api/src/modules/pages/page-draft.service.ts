import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import {
  createEmptyPageCompositionV1,
  DraftSchema,
  parsePageCompositionV1,
  type Draft,
  type SavePageDraftRequest,
} from '@payload/contracts';

import {
  PageDraftRecord,
  type PageDraftDocument,
} from '../../persistence/schemas/page-draft.schema';
import { PageRecord } from '../../persistence/schemas/page.schema';
import { SiteRecord } from '../../persistence/schemas/site.schema';

@Injectable()
export class PageDraftService {
  constructor(
    @InjectModel(PageDraftRecord.name)
    private readonly draftModel: Model<PageDraftRecord>,
    @InjectModel(PageRecord.name)
    private readonly pageModel: Model<PageRecord>,
    @InjectModel(SiteRecord.name)
    private readonly siteModel: Model<SiteRecord>,
  ) {}

  async createInitialDraft(
    page: Pick<PageRecord, '_id' | 'workspaceId' | 'siteId'>,
  ): Promise<Draft> {
    try {
      // Existing tenant databases may first encounter this model after provisioning.
      await this.draftModel.init();
      const record = await this.draftModel.create({
        _id: randomUUID(),
        workspaceId: page.workspaceId,
        siteId: page.siteId,
        pageId: page._id,
        versionNumber: 1,
        composition: createEmptyPageCompositionV1(),
      });
      return this.toContract(record);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException({
          code: 'DRAFT_ALREADY_EXISTS',
          message: 'The page already has a canonical Draft',
        });
      }
      throw error;
    }
  }

  async loadDraft(pageId: string, workspaceId: string): Promise<Draft> {
    const siteId = await this.requireOwnedPage(pageId, workspaceId);
    const record = await this.draftModel.findOne({ pageId, siteId, workspaceId }).exec();
    if (!record) throw this.draftNotFound();
    return this.toContract(record);
  }

  async saveDraft(
    pageId: string,
    input: SavePageDraftRequest,
    workspaceId: string,
  ): Promise<Draft> {
    if (
      !Number.isInteger(input.expectedVersionNumber) ||
      input.expectedVersionNumber < 1
    ) {
      throw new BadRequestException({
        code: 'INVALID_DRAFT_VERSION_NUMBER',
        message: 'expectedVersionNumber must be a positive integer',
      });
    }
    const composition = parsePageCompositionV1(input.composition);
    const siteId = await this.requireOwnedPage(pageId, workspaceId);
    const filter = { pageId, siteId, workspaceId };
    const record = await this.draftModel
      .findOneAndUpdate(
        { ...filter, versionNumber: input.expectedVersionNumber },
        { $set: { composition }, $inc: { versionNumber: 1 } },
        { new: true, runValidators: true },
      )
      .exec();
    if (!record) {
      const existing = await this.draftModel.findOne(filter).exec();
      if (!existing) throw this.draftNotFound();
      throw new ConflictException({
        code: 'DRAFT_VERSION_CONFLICT',
        message: 'The Draft changed since it was loaded. Reload it before saving again.',
      });
    }
    return this.toContract(record);
  }

  async removeDraft(pageId: string, siteId: string, workspaceId: string): Promise<void> {
    await this.draftModel.deleteOne({ pageId, siteId, workspaceId }).exec();
  }

  async removeDraftsForSite(siteId: string, workspaceId: string): Promise<void> {
    await this.draftModel.deleteMany({ siteId, workspaceId }).exec();
  }

  private async requireOwnedPage(pageId: string, workspaceId: string): Promise<string> {
    const page = await this.pageModel.findOne({ _id: pageId, workspaceId }).exec();
    if (!page) throw this.draftNotFound();
    const site = await this.siteModel.findOne({ _id: page.siteId, workspaceId }).exec();
    if (!site) throw this.draftNotFound();
    return site._id.toString();
  }

  private toContract(record: PageDraftDocument): Draft {
    return DraftSchema.parse({
      id: record._id.toString(),
      workspaceId: record.workspaceId,
      siteId: record.siteId,
      pageId: record.pageId,
      versionNumber: record.versionNumber,
      composition: record.composition,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }

  private draftNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'DRAFT_NOT_FOUND',
      message: 'The canonical Draft was not found in this workspace',
    });
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'code' in error && error.code === 11000
  );
}
