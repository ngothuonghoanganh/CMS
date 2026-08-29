import {
  BadRequestException,
  ConflictException,
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
  DuplicatePageRequestSchema,
  PageSchema,
  PagePayloadSchema,
  PageListResponseSchema,
  PublicPageSchema,
  PageVersionListResponseSchema,
  PageVersionSchema,
  PaginationQuerySchema,
  PublishPageRequestSchema,
  UpdatePageRequestSchema,
  normalizePagePath,
  type CreatePageRequest,
  type CreatePageVersionRequest,
  type DuplicatePageRequest,
  type Page,
  type PagePayload,
  type PageListResponse,
  type PublicPage,
  type PageVersionListResponse,
  type PageVersion,
  type PaginationQuery,
  type PublishPageRequest,
  type UpdatePageRequest,
} from '@payload/contracts';

import { QuotaService } from '../billing/quota.service';
import { assertExpectedVersionNumber, nextVersionNumber } from './versioning';
import { PublicPageResolver } from './public-page.resolver';
import { PageRecord, type PageDocument } from '../persistence/schemas/page.schema';
import {
  PageVersionRecord,
  type PageVersionDocument,
} from '../persistence/schemas/page-version.schema';
import { SiteRecord, type SiteDocument } from '../persistence/schemas/site.schema';
import { EventBus } from '../extensions/event-bus';
import { PageExtensionService } from '../extensions/page-extension.service';
import { TenantContext } from '../tenancy/tenant-context';
import { WorkflowService } from '../workflows/workflow.service';
import { SiteService } from './site.service';
import { NavigationService } from './navigation.service';

@Injectable()
export class PageService {
  constructor(
    @InjectModel(PageRecord.name)
    private readonly pageModel: Model<PageRecord>,
    @InjectModel(PageVersionRecord.name)
    private readonly versionModel: Model<PageVersionRecord>,
    @InjectModel(SiteRecord.name)
    private readonly siteModel: Model<SiteRecord>,
    @Inject(PublicPageResolver)
    private readonly publicPageResolver: PublicPageResolver,
    @Inject(QuotaService) private readonly quotas: QuotaService,
    @Inject(EventBus) private readonly events: EventBus,
    @Inject(PageExtensionService)
    private readonly pageExtensions: PageExtensionService,
    @Inject(TenantContext) private readonly tenantContext: TenantContext,
    @Inject(WorkflowService) private readonly workflows: WorkflowService,
    @Inject(SiteService) private readonly sites: SiteService,
    @Inject(NavigationService) private readonly navigation: NavigationService,
  ) {}

  async create(
    siteId: string,
    input: CreatePageRequest,
    workspaceId: string,
  ): Promise<Page> {
    return this.quotas.withHardQuota('landing_pages', async () => {
      const site = await this.requireSite(siteId, workspaceId);
      await this.sites.ensureHomePage(site);
      const payload = this.parsePayload(input.payload);
      const pageId = randomUUID();
      const path = this.requirePath(
        input.path ??
          (input.slug
            ? `/${input.slug}`
            : `/${slugifyPagePath(input.name) || `page-${pageId.slice(-12)}`}`),
      );
      if (input.parentId) await this.requireParent(input.parentId, siteId, workspaceId);
      const versionId = randomUUID();
      let page: PageDocument;
      try {
        page = await this.pageModel.create({
          _id: pageId,
          workspaceId: site.workspaceId,
          siteId,
          name: input.name,
          ...(input.description ? { description: input.description } : {}),
          path,
          kind: input.kind ?? 'standard',
          ...(input.parentId ? { parentId: input.parentId } : {}),
          ...(input.anchors ? { anchors: input.anchors } : {}),
          ...(input.slug ? { slug: input.slug } : {}),
        });
      } catch (error) {
        if (isDuplicateKeyError(error)) throw this.duplicatePath();
        throw error;
      }
      try {
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
        await this.pageExtensions.synchronizePayload(pageId, site.workspaceId, payload);

        await this.events.publish('page.created', {
          tenantId: this.tenantContext.require().id,
          pageId,
          workspaceId: site.workspaceId,
          siteId,
          occurredAt: new Date().toISOString(),
        });
      } catch (error) {
        await this.versionModel.deleteMany({ landingPageId: pageId }).exec();
        await page.deleteOne().exec();
        throw error;
      }

      return this.toPageContract(page);
    });
  }

  async listBySite(
    siteId: string,
    input: PaginationQuery,
    workspaceId: string,
  ): Promise<PageListResponse> {
    const site = await this.requireSite(siteId, workspaceId);
    await this.sites.ensureHomePage(site);
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

  async getById(pageId: string, workspaceId: string): Promise<Page> {
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
  ): Promise<Page> {
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
    if (parsedInput.description !== undefined) {
      if (parsedInput.description === null) {
        page.set('description', undefined);
      } else {
        page.description = parsedInput.description;
      }
    }
    if (parsedInput.path !== undefined && parsedInput.path !== null) {
      page.path = this.requirePath(parsedInput.path);
    }
    if (parsedInput.slug !== undefined) {
      if (parsedInput.slug === null) {
        page.set('slug', undefined);
      } else {
        page.slug = parsedInput.slug;
        if (parsedInput.path === undefined) {
          page.path = this.requirePath(`/${parsedInput.slug}`);
        }
      }
    }
    if (parsedInput.parentId !== undefined) {
      if (parsedInput.parentId === null) {
        page.set('parentId', undefined);
      } else {
        await this.requireParent(parsedInput.parentId, page.siteId, workspaceId);
        page.parentId = parsedInput.parentId;
      }
    }
    if (parsedInput.kind !== undefined) {
      page.kind = parsedInput.kind;
    }
    if (parsedInput.anchors !== undefined) {
      page.anchors = parsedInput.anchors;
    }
    if (parsedInput.payload !== undefined) {
      await this.persistVersion(
        page,
        this.parsePayload(parsedInput.payload),
        latestVersion?.versionNumber,
        latestVersion?._id.toString(),
      );
    }
    try {
      await page.save();
    } catch (error) {
      if (isDuplicateKeyError(error)) throw this.duplicatePath();
      throw error;
    }

    await this.events.publish('page.updated', {
      tenantId: this.tenantContext.require().id,
      pageId,
      workspaceId,
      ...(parsedInput.payload !== undefined && latestVersion
        ? { versionNumber: latestVersion.versionNumber + 1 }
        : {}),
      occurredAt: new Date().toISOString(),
    });

    return this.toPageContract(page);
  }

  async remove(pageId: string, workspaceId: string): Promise<void> {
    const page = await this.requirePageDocument(pageId, workspaceId);
    const site = await this.requireSite(page.siteId, workspaceId);
    await this.sites.ensureHomePage(site);
    if (site.homePageId === pageId) {
      throw new ConflictException({
        code: 'HOME_PAGE_CANNOT_BE_DELETED',
        message: 'Choose another homepage before deleting the current homepage',
      });
    }
    await this.navigation.assertPageCanBeDeleted(page.siteId, pageId, workspaceId);
    await this.versionModel.deleteMany({ landingPageId: pageId }).exec();
    await page.deleteOne();
  }

  async duplicate(
    pageId: string,
    input: DuplicatePageRequest,
    workspaceId: string,
  ): Promise<Page> {
    const parsedInput = DuplicatePageRequestSchema.parse(input);
    return this.quotas.withHardQuota('landing_pages', async () => {
      const source = await this.requirePageDocument(pageId, workspaceId);
      const latest = await this.findLatestVersion(pageId, workspaceId);
      if (!latest) {
        throw new NotFoundException({
          code: 'PAGE_VERSION_NOT_FOUND',
          message: 'The page does not have a version to duplicate',
        });
      }
      const site = await this.requireSite(source.siteId, workspaceId);
      const path = await this.findAvailablePath(
        site._id.toString(),
        parsedInput.path ??
          this.copyPath(source.path ?? (source.slug ? `/${source.slug}` : '/')),
        workspaceId,
      );
      const duplicated = await this.pageModel.create({
        _id: randomUUID(),
        workspaceId,
        siteId: source.siteId,
        name: parsedInput.name ?? `Copy of ${source.name}`,
        ...(source.description ? { description: source.description } : {}),
        path,
        kind: source.kind ?? 'standard',
        ...(source.parentId ? { parentId: source.parentId } : {}),
        ...(source.anchors ? { anchors: [...source.anchors] } : {}),
      });
      try {
        const version = await this.versionModel.create({
          _id: randomUUID(),
          workspaceId,
          siteId: source.siteId,
          landingPageId: duplicated._id.toString(),
          versionNumber: 1,
          payload: latest.payload,
        });
        duplicated.currentDraftVersionId = version._id.toString();
        await duplicated.save();
        await this.pageExtensions.synchronizePayload(
          duplicated._id.toString(),
          workspaceId,
          this.parsePayload(latest.payload),
        );
        return this.toPageContract(duplicated);
      } catch (error) {
        await this.versionModel.deleteMany({ landingPageId: duplicated._id }).exec();
        await duplicated.deleteOne().exec();
        throw error;
      }
    });
  }

  async setHomepage(pageId: string, workspaceId: string): Promise<Page> {
    const page = await this.requirePageDocument(pageId, workspaceId);
    const site = await this.requireSite(page.siteId, workspaceId);
    await this.sites.ensureHomePage(site);
    if (site.homePageId === pageId && page.path === '/') return this.toPageContract(page);

    const currentHome = site.homePageId
      ? await this.pageModel
          .findOne({ _id: site.homePageId, siteId: site._id.toString(), workspaceId })
          .exec()
      : null;
    if (currentHome && currentHome._id.toString() !== pageId) {
      currentHome.path = await this.findAvailablePath(
        site._id.toString(),
        currentHome.path && currentHome.path !== '/' ? currentHome.path : '/home',
        workspaceId,
        currentHome._id.toString(),
      );
      await currentHome.save();
    }
    page.path = '/';
    await page.save();
    site.homePageId = pageId;
    await site.save();
    return this.toPageContract(page);
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
      latestVersion?._id.toString(),
    );
  }

  async publish(
    pageId: string,
    input: PublishPageRequest,
    workspaceId: string,
  ): Promise<Page> {
    const parsedInput = PublishPageRequestSchema.parse(input);
    const page = await this.requirePageDocument(pageId, workspaceId);

    const version = await this.findPublicationVersion(page, parsedInput.versionNumber);
    if (!version) {
      throw new NotFoundException({
        code: 'PAGE_VERSION_NOT_FOUND',
        message: 'The selected page version was not found',
      });
    }

    const payload = PagePayloadSchema.parse(version.payload);
    await this.workflows.validatePagePublishDependencies(pageId, workspaceId);
    await this.navigation.validateBeforePagePublish(page.siteId, pageId, workspaceId);
    await this.pageExtensions.validateBeforePublish(pageId, workspaceId, payload);
    const publishedBundle = await this.pageExtensions.compilePublishedBundle(
      pageId,
      workspaceId,
      version.versionNumber,
      payload,
    );
    version.set('publishedBundle', publishedBundle);
    await version.save();

    page.publishedVersionId = version._id.toString();
    page.status = 'published';
    await page.save();

    await this.events.publish('page.published', {
      tenantId: this.tenantContext.require().id,
      pageId,
      workspaceId,
      versionNumber: version.versionNumber,
      occurredAt: new Date().toISOString(),
    });
    await this.pageExtensions.afterPublish(pageId, workspaceId, version.versionNumber);

    return this.toPageContract(page);
  }

  async unpublish(pageId: string, workspaceId: string): Promise<Page> {
    const page = await this.requirePageDocument(pageId, workspaceId);
    page.set('publishedVersionId', undefined);
    await page.save();
    return this.toPageContract(page);
  }

  async resolvePublicPage(siteSlug: string, pageSlug: string): Promise<PublicPage> {
    return this.publicPageResolver.resolveByLegacySlug(siteSlug, pageSlug);
  }

  async resolvePublicPageByPath(siteSlug: string, path: string): Promise<PublicPage> {
    return this.publicPageResolver.resolveByPath(siteSlug, path);
  }

  async resolvePreview(pageId: string, workspaceId: string): Promise<PublicPage> {
    const page = await this.requirePageDocument(pageId, workspaceId);
    const site = await this.siteModel.findOne({ _id: page.siteId, workspaceId }).exec();

    if (!site) {
      throw this.pageNotFound(pageId);
    }

    const version = await this.findPublicationVersion(page);
    if (!version) {
      throw new NotFoundException({
        code: 'DRAFT_VERSION_NOT_FOUND',
        message: 'The page does not have a current draft version',
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
    page: PageDocument,
    payload: PagePayload,
    currentVersionNumber: number | undefined,
    expectedDraftVersionId: string | undefined,
  ): Promise<PageVersion> {
    const versionNumber = nextVersionNumber(currentVersionNumber);
    let record: PageVersionDocument;
    try {
      record = await this.versionModel.create({
        _id: randomUUID(),
        workspaceId: page.workspaceId,
        siteId: page.siteId,
        landingPageId: page._id.toString(),
        versionNumber,
        payload,
      });
    } catch (caughtError) {
      if (isDuplicateKeyError(caughtError)) {
        throw new ConflictException({
          code: 'PAGE_VERSION_CONFLICT',
          message: 'The page draft changed while this version was being created',
        });
      }
      throw caughtError;
    }
    const currentDraftFilter = expectedDraftVersionId
      ? { currentDraftVersionId: expectedDraftVersionId }
      : { currentDraftVersionId: { $exists: false } };
    const advancedPage = await this.pageModel
      .findOneAndUpdate(
        {
          _id: page._id.toString(),
          workspaceId: page.workspaceId,
          ...currentDraftFilter,
        },
        { $set: { currentDraftVersionId: record._id.toString() } },
        { new: true },
      )
      .exec();
    if (!advancedPage) {
      await record.deleteOne().catch(() => undefined);
      throw new ConflictException({
        code: 'PAGE_VERSION_CONFLICT',
        message: 'The page draft changed while this version was being created',
      });
    }
    page.currentDraftVersionId = record._id.toString();
    await this.pageExtensions.synchronizePayload(
      page._id.toString(),
      page.workspaceId,
      payload,
    );
    return this.toVersionContract(record);
  }

  private async findPublicationVersion(
    page: PageDocument,
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

  private async requireParent(
    parentId: string,
    siteId: string,
    workspaceId: string,
  ): Promise<void> {
    const parent = await this.pageModel
      .findOne({ _id: parentId, siteId, workspaceId })
      .select({ _id: 1 })
      .exec();
    if (!parent) {
      throw new NotFoundException({
        code: 'PARENT_PAGE_NOT_FOUND',
        message: 'The parent page was not found in this site',
      });
    }
  }

  private requirePath(value: string): string {
    const normalized = normalizePagePath(value);
    if (!normalized) {
      throw new BadRequestException({
        code: 'INVALID_PAGE_PATH',
        message: 'Page path must be a normalized URL path such as /about',
      });
    }
    return normalized;
  }

  private async findAvailablePath(
    siteId: string,
    requestedPath: string,
    workspaceId: string,
    exceptPageId?: string,
  ): Promise<string> {
    const normalized = this.requirePath(requestedPath);
    const base = normalized === '/' ? '/home-copy' : `${normalized}-copy`;
    let candidate = normalized;
    let index = 0;
    while (
      await this.pageModel.exists({
        siteId,
        workspaceId,
        path: candidate,
        ...(exceptPageId ? { _id: { $ne: exceptPageId } } : {}),
      })
    ) {
      index += 1;
      candidate = `${base}${index === 1 ? '' : `-${index}`}`;
    }
    return candidate;
  }

  private copyPath(path: string): string {
    const normalized = this.requirePath(path);
    return normalized === '/' ? '/home-copy' : `${normalized}-copy`;
  }

  private async requirePageDocument(
    pageId: string,
    workspaceId: string,
  ): Promise<PageDocument> {
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

  private toPageContract(record: PageDocument): Page {
    return PageSchema.parse({
      id: record._id.toString(),
      workspaceId: record.workspaceId,
      siteId: record.siteId,
      name: record.name,
      ...(record.description ? { description: record.description } : {}),
      path: this.requirePath(record.path ?? (record.slug ? `/${record.slug}` : '/')),
      kind: record.kind ?? 'standard',
      status:
        record.status === 'archived'
          ? 'archived'
          : record.publishedVersionId
            ? record.currentDraftVersionId === record.publishedVersionId
              ? 'published'
              : 'modified'
            : 'draft',
      ...(record.parentId ? { parentId: record.parentId } : {}),
      ...(record.anchors?.length ? { anchors: record.anchors } : {}),
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

  private async toPublicContract(
    site: SiteDocument,
    page: PageDocument,
    version: PageVersionDocument,
  ): Promise<PublicPage> {
    try {
      const versionContract = this.toVersionContract(version);
      const extensions = await this.pageExtensions.resolveRuntime(
        page._id.toString(),
        page.workspaceId,
      );
      return PublicPageSchema.parse({
        site: { name: site.name, slug: site.slug },
        page: {
          name: page.name,
          ...(page.description ? { description: page.description } : {}),
          ...(page.slug ? { slug: page.slug } : {}),
        },
        payload: versionContract.payload,
        ...(extensions.length ? { extensions } : {}),
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

  private duplicatePath(): ConflictException {
    return new ConflictException({
      code: 'DUPLICATE_PAGE_PATH',
      message: 'A page with this path already exists in the site',
    });
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

function slugifyPagePath(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}
