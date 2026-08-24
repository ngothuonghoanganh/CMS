import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';

import {
  CreatePageVersionRequestSchema,
  LandingPageSchema,
  PagePayloadSchema,
  PageListResponseSchema,
  PublicLandingPageSchema,
  PageVersionListResponseSchema,
  PageVersionSchema,
  PaginationQuerySchema,
  PublishPageRequestSchema,
  UpdatePageRequestSchema,
  type CreatePageRequest,
  type CreatePageVersionRequest,
  type LandingPage,
  type PagePayload,
  type PageListResponse,
  type PublicLandingPage,
  type PageVersionListResponse,
  type PageVersion,
  type PaginationQuery,
  type PublishPageRequest,
  type UpdatePageRequest,
} from '@payload/contracts';

import { QuotaService } from '../billing/quota.service';
import { assertExpectedVersionNumber, nextVersionNumber } from './versioning';
import { PublicPageResolver } from './public-page.resolver';
import {
  LandingPageRecord,
  type LandingPageDocument,
} from '../persistence/schemas/landing-page.schema';
import {
  PageVersionRecord,
  type PageVersionDocument,
} from '../persistence/schemas/page-version.schema';
import { SiteRecord, type SiteDocument } from '../persistence/schemas/site.schema';

@Injectable()
export class PageService {
  constructor(
    @InjectModel(LandingPageRecord.name)
    private readonly pageModel: Model<LandingPageRecord>,
    @InjectModel(PageVersionRecord.name)
    private readonly versionModel: Model<PageVersionRecord>,
    @InjectModel(SiteRecord.name)
    private readonly siteModel: Model<SiteRecord>,
    @Inject(PublicPageResolver)
    private readonly publicPageResolver: PublicPageResolver,
    @Inject(QuotaService) private readonly quotas: QuotaService,
  ) {}

  async create(
    siteId: string,
    input: CreatePageRequest,
    workspaceId: string,
  ): Promise<LandingPage> {
    return this.quotas.withHardQuota('landing_pages', async () => {
      const site = await this.requireSite(siteId, workspaceId);
      const payload = this.parsePayload(input.payload);
      const pageId = randomUUID();
      const versionId = randomUUID();
      const page = await this.pageModel.create({
        _id: pageId,
        workspaceId: site.workspaceId,
        siteId,
        name: input.name,
        ...(input.slug ? { slug: input.slug } : {}),
      });
      await this.versionModel.create({
        _id: versionId,
        workspaceId: site.workspaceId,
        siteId,
        landingPageId: pageId,
        versionNumber: 1,
        payload,
      });
      page.currentDraftVersionId = versionId;
      await page.save();

      return this.toPageContract(page);
    });
  }

  async listBySite(
    siteId: string,
    input: PaginationQuery,
    workspaceId: string,
  ): Promise<PageListResponse> {
    await this.requireSite(siteId, workspaceId);
    const query = PaginationQuerySchema.parse(input);
    const [records, total] = await Promise.all([
      this.pageModel
        .find({ siteId, workspaceId })
        .sort({ createdAt: -1, _id: -1 })
        .skip(query.offset)
        .limit(query.limit)
        .exec(),
      this.pageModel.countDocuments({ siteId, workspaceId }).exec(),
    ]);

    return PageListResponseSchema.parse({
      items: records.map((record) => this.toPageContract(record)),
      pagination: {
        ...query,
        total,
        hasNextPage: query.offset + records.length < total,
      },
    });
  }

  async getById(pageId: string, workspaceId: string): Promise<LandingPage> {
    const record = await this.pageModel.findOne({ _id: pageId, workspaceId }).exec();

    if (!record) {
      throw this.pageNotFound(pageId);
    }

    return this.toPageContract(record);
  }

  async update(
    pageId: string,
    input: UpdatePageRequest,
    workspaceId: string,
  ): Promise<LandingPage> {
    const parsedInput = UpdatePageRequestSchema.parse(input);
    const page = await this.requirePageDocument(pageId, workspaceId);
    const latestVersion = await this.findLatestVersion(pageId, workspaceId);

    assertExpectedVersionNumber(
      parsedInput.expectedVersionNumber,
      latestVersion?.versionNumber ?? 0,
    );

    if (parsedInput.name !== undefined) {
      page.name = parsedInput.name;
    }
    if (parsedInput.slug !== undefined) {
      page.set('slug', parsedInput.slug);
    }
    if (parsedInput.payload !== undefined) {
      await this.persistVersion(
        page,
        this.parsePayload(parsedInput.payload),
        latestVersion?.versionNumber,
      );
    }
    await page.save();

    return this.toPageContract(page);
  }

  async remove(pageId: string, workspaceId: string): Promise<void> {
    const page = await this.requirePageDocument(pageId, workspaceId);
    await this.versionModel.deleteMany({ landingPageId: pageId }).exec();
    await page.deleteOne();
  }

  async createVersion(
    pageId: string,
    input: CreatePageVersionRequest,
    workspaceId: string,
  ): Promise<PageVersion> {
    const parsedInput = CreatePageVersionRequestSchema.parse(input);
    const page = await this.requirePageDocument(pageId, workspaceId);
    const latestVersion = await this.findLatestVersion(pageId, workspaceId);

    assertExpectedVersionNumber(
      parsedInput.expectedVersionNumber,
      latestVersion?.versionNumber ?? 0,
    );

    return this.persistVersion(
      page,
      this.parsePayload(parsedInput.payload),
      latestVersion?.versionNumber,
    );
  }

  async publish(
    pageId: string,
    input: PublishPageRequest,
    workspaceId: string,
  ): Promise<LandingPage> {
    const parsedInput = PublishPageRequestSchema.parse(input);
    const page = await this.requirePageDocument(pageId, workspaceId);

    if (!page.slug) {
      throw new BadRequestException({
        code: 'PAGE_SLUG_REQUIRED_FOR_PUBLISH',
        message: 'A page slug is required before publishing',
      });
    }

    const version = await this.findPublicationVersion(page, parsedInput.versionNumber);
    if (!version) {
      throw new NotFoundException({
        code: 'PAGE_VERSION_NOT_FOUND',
        message: 'The selected page version was not found',
      });
    }

    page.publishedVersionId = version._id.toString();
    await page.save();

    return this.toPageContract(page);
  }

  async unpublish(pageId: string, workspaceId: string): Promise<LandingPage> {
    const page = await this.requirePageDocument(pageId, workspaceId);
    page.set('publishedVersionId', undefined);
    await page.save();
    return this.toPageContract(page);
  }

  async resolvePublicPage(
    siteSlug: string,
    pageSlug: string,
  ): Promise<PublicLandingPage> {
    return this.publicPageResolver.resolveByPath(siteSlug, pageSlug);
  }

  async resolvePreview(pageId: string, workspaceId: string): Promise<PublicLandingPage> {
    const page = await this.requirePageDocument(pageId, workspaceId);
    const site = await this.siteModel.findOne({ _id: page.siteId, workspaceId }).exec();

    if (!site) {
      throw this.pageNotFound(pageId);
    }

    const version = await this.findPublicationVersion(page);
    if (!version) {
      throw new NotFoundException({
        code: 'DRAFT_VERSION_NOT_FOUND',
        message: 'The landing page does not have a current draft version',
      });
    }

    return this.toPublicContract(site, page, version);
  }

  async listVersions(
    pageId: string,
    input: PaginationQuery,
    workspaceId: string,
  ): Promise<PageVersionListResponse> {
    await this.requirePageDocument(pageId, workspaceId);
    const query = PaginationQuerySchema.parse(input);
    const [records, total] = await Promise.all([
      this.versionModel
        .find({ landingPageId: pageId, workspaceId })
        .sort({ versionNumber: -1, _id: -1 })
        .skip(query.offset)
        .limit(query.limit)
        .exec(),
      this.versionModel.countDocuments({ landingPageId: pageId, workspaceId }).exec(),
    ]);

    return PageVersionListResponseSchema.parse({
      items: records.map((record) => this.toVersionContract(record)),
      pagination: {
        ...query,
        total,
        hasNextPage: query.offset + records.length < total,
      },
    });
  }

  async getVersion(
    pageId: string,
    versionNumber: number,
    workspaceId: string,
  ): Promise<PageVersion> {
    await this.requirePageDocument(pageId, workspaceId);
    const record = await this.versionModel
      .findOne({ landingPageId: pageId, workspaceId, versionNumber })
      .exec();

    if (!record) {
      throw new NotFoundException({
        code: 'PAGE_VERSION_NOT_FOUND',
        message: `Version ${versionNumber} for page ${pageId} was not found`,
      });
    }

    return this.toVersionContract(record);
  }

  private async persistVersion(
    page: LandingPageDocument,
    payload: PagePayload,
    currentVersionNumber: number | undefined,
  ): Promise<PageVersion> {
    const versionNumber = nextVersionNumber(currentVersionNumber);
    const record = await this.versionModel.create({
      _id: randomUUID(),
      workspaceId: page.workspaceId,
      siteId: page.siteId,
      landingPageId: page._id.toString(),
      versionNumber,
      payload,
    });
    page.currentDraftVersionId = record._id.toString();
    await page.save();
    return this.toVersionContract(record);
  }

  private async findPublicationVersion(
    page: LandingPageDocument,
    versionNumber?: number,
  ): Promise<PageVersionDocument | null> {
    if (versionNumber !== undefined) {
      return this.versionModel
        .findOne({
          landingPageId: page._id.toString(),
          siteId: page.siteId,
          workspaceId: page.workspaceId,
          versionNumber,
        })
        .exec();
    }

    if (!page.currentDraftVersionId) {
      return null;
    }

    return this.versionModel
      .findOne({
        _id: page.currentDraftVersionId,
        landingPageId: page._id.toString(),
        siteId: page.siteId,
        workspaceId: page.workspaceId,
      })
      .exec();
  }

  private async requireSite(siteId: string, workspaceId: string): Promise<SiteDocument> {
    const site = await this.siteModel.findOne({ _id: siteId, workspaceId }).exec();

    if (!site) {
      throw new NotFoundException({
        code: 'SITE_NOT_FOUND',
        message: `Site ${siteId} was not found`,
      });
    }

    return site;
  }

  private async requirePageDocument(
    pageId: string,
    workspaceId: string,
  ): Promise<LandingPageDocument> {
    const page = await this.pageModel.findOne({ _id: pageId, workspaceId }).exec();

    if (!page) {
      throw this.pageNotFound(pageId);
    }

    return page;
  }

  private async findLatestVersion(
    pageId: string,
    workspaceId: string,
  ): Promise<PageVersionDocument | null> {
    return this.versionModel
      .findOne({ landingPageId: pageId, workspaceId })
      .sort({ versionNumber: -1 })
      .exec();
  }

  private parsePayload(payload: unknown): PagePayload {
    const result = PagePayloadSchema.safeParse(payload);

    if (!result.success) {
      const issueMessages = result.error.issues.map((issue) => issue.message);
      const code = issueMessages.some((message) =>
        message.includes('PAGE_PAYLOAD_TOO_LARGE'),
      )
        ? 'PAGE_PAYLOAD_TOO_LARGE'
        : issueMessages.some((message) => message.includes('PAGE_PAYLOAD_'))
          ? 'PAGE_PAYLOAD_LIMIT_EXCEEDED'
          : 'INVALID_PAGE_PAYLOAD';
      throw new BadRequestException({
        code,
        message: issueMessages.join('; '),
      });
    }

    return result.data;
  }

  private toPageContract(record: LandingPageDocument): LandingPage {
    return LandingPageSchema.parse({
      id: record._id.toString(),
      workspaceId: record.workspaceId,
      siteId: record.siteId,
      name: record.name,
      ...(record.slug ? { slug: record.slug } : {}),
      ...(record.currentDraftVersionId
        ? { currentDraftVersionId: record.currentDraftVersionId }
        : {}),
      ...(record.publishedVersionId
        ? { publishedVersionId: record.publishedVersionId }
        : {}),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }

  private toPublicContract(
    site: SiteDocument,
    page: LandingPageDocument,
    version: PageVersionDocument,
  ): PublicLandingPage {
    try {
      const versionContract = this.toVersionContract(version);
      return PublicLandingPageSchema.parse({
        site: { name: site.name, slug: site.slug },
        page: {
          name: page.name,
          ...(page.slug ? { slug: page.slug } : {}),
        },
        payload: versionContract.payload,
      });
    } catch {
      throw this.invalidPublishedPage();
    }
  }

  private toVersionContract(record: PageVersionDocument): PageVersion {
    return PageVersionSchema.parse({
      id: record._id.toString(),
      workspaceId: record.workspaceId,
      siteId: record.siteId,
      landingPageId: record.landingPageId,
      versionNumber: record.versionNumber,
      payload: record.payload,
      createdAt: record.createdAt.toISOString(),
    });
  }

  private pageNotFound(pageId: string): NotFoundException {
    return new NotFoundException({
      code: 'PAGE_NOT_FOUND',
      message: `Page ${pageId} was not found`,
    });
  }

  private publicPageNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'PUBLIC_PAGE_NOT_FOUND',
      message: 'The requested public page was not found',
    });
  }

  private invalidPublishedPage(): InternalServerErrorException {
    return new InternalServerErrorException({
      code: 'INVALID_PUBLISHED_PAGE',
      message: 'The published page data is invalid',
    });
  }
}
