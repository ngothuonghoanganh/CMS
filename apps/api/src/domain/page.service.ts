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
  SiteDesignSystemSchema,
  SiteGlobalsSchema,
  PageLayoutAttachmentsSchema,
  PageLayoutUpdateRequestSchema,
  PageListResponseSchema,
  PublicPageSchema,
  PageVersionListResponseSchema,
  PageVersionSchema,
  PageCompositionSchema,
  PaginationQuerySchema,
  PublishPageRequestSchema,
  UpdatePageRequestSchema,
  normalizePagePath,
  normalizeUrlSlug,
  type CreatePageRequest,
  type CreatePageVersionRequest,
  type DuplicatePageRequest,
  type Page,
  type PagePayload,
  type PageLayoutAttachment,
  type PageListResponse,
  type PublicPage,
  type PageVersionListResponse,
  type PageComposition,
  type PageCompositionInput,
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
import { LayoutExtensionService } from './layout-extension.service';
import { ReusableService } from './reusable.service';
import {
  PageCompositionError,
  clonePageCompositionForPage,
  normalizePageComposition,
} from './page-composition';

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
    @Inject(LayoutExtensionService)
    private readonly layoutExtensions: LayoutExtensionService,
    @Inject(ReusableService) private readonly reusables: ReusableService,
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
      const composition = this.normalizeComposition(
        pageId,
        payload,
        input.composition,
        undefined,
        input.composition?.layoutAttachments ?? input.layoutAttachments,
      );
      const path = this.requirePath(
        input.path ??
          (input.slug
            ? `/${normalizeUrlSlug(input.slug)}`
            : `/${normalizeUrlSlug(input.name) || `page-${pageId.slice(-12)}`}`),
      );
      const legacySlug = normalizeUrlSlug(input.slug ?? path.replace(/^\/+/, ''));
      if (input.parentId) await this.requireParent(input.parentId, siteId, workspaceId);
      const requestedLayoutAttachments =
        input.composition?.layoutAttachments ?? input.layoutAttachments;
      if (requestedLayoutAttachments) {
        await this.assertLayoutAttachmentsAvailable(
          siteId,
          workspaceId,
          PageLayoutAttachmentsSchema.parse(requestedLayoutAttachments),
        );
      }
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
          ...(legacySlug ? { slug: legacySlug } : {}),
          ...(requestedLayoutAttachments?.length
            ? { layoutAttachments: requestedLayoutAttachments }
            : {}),
          ...(input.appliedTemplate ? { appliedTemplate: input.appliedTemplate } : {}),
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
          composition,
        });
        page.currentDraftVersionId = versionId;
        await page.save();
        await this.pageExtensions.synchronizeComposition(
          pageId,
          site.workspaceId,
          composition,
        );

        await this.events.publish('page.created', {
          tenantId: this.tenantContext.require().id,
          pageId,
          workspaceId: site.workspaceId,
          siteId,
          occurredAt: new Date().toISOString(),
        });
      } catch (error) {
        await this.pageExtensions
          .removeAllForPage(pageId, site.workspaceId)
          .catch(() => undefined);
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
      const legacySlug = normalizeUrlSlug(page.path.replace(/^\/+/, ''));
      if (legacySlug) page.slug = legacySlug;
    }
    if (parsedInput.slug !== undefined) {
      if (parsedInput.slug === null) {
        page.set('slug', undefined);
      } else {
        const normalizedSlug = normalizeUrlSlug(parsedInput.slug);
        page.slug = normalizedSlug;
        if (parsedInput.path === undefined) {
          page.path = this.requirePath(`/${normalizedSlug}`);
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
    const draftPayload = parsedInput.payload ?? parsedInput.composition?.payload;
    if (draftPayload !== undefined) {
      await this.persistVersion(
        page,
        this.parsePayload(draftPayload),
        latestVersion?.versionNumber,
        latestVersion?._id.toString(),
        parsedInput.composition,
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
      ...(draftPayload !== undefined && latestVersion
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
    await this.pageExtensions.removeAllForPage(pageId, workspaceId);
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
        const sourcePayload = this.parsePayload(latest.payload);
        const sourceComposition = this.compositionForVersion(
          source,
          latest,
          sourcePayload,
        );
        if (!sourceComposition) {
          throw new InternalServerErrorException({
            code: 'PAGE_COMPOSITION_INVALID',
            message: 'The source page composition could not be normalized',
          });
        }
        const composition = clonePageCompositionForPage(
          sourceComposition,
          duplicated._id.toString(),
        );
        const version = await this.versionModel.create({
          _id: randomUUID(),
          workspaceId,
          siteId: source.siteId,
          landingPageId: duplicated._id.toString(),
          versionNumber: 1,
          payload: composition.payload,
          composition,
        });
        duplicated.currentDraftVersionId = version._id.toString();
        if (composition.layoutAttachments.length > 0) {
          duplicated.layoutAttachments = composition.layoutAttachments;
        }
        await duplicated.save();
        await this.pageExtensions.synchronizeComposition(
          duplicated._id.toString(),
          workspaceId,
          composition,
        );
        return this.toPageContract(duplicated);
      } catch (error) {
        await this.pageExtensions
          .removeAllForPage(duplicated._id.toString(), workspaceId)
          .catch(() => undefined);
        await this.versionModel.deleteMany({ landingPageId: duplicated._id }).exec();
        await duplicated.deleteOne().exec();
        throw error;
      }
    });
  }

  async setHomepage(pageId: string, workspaceId: string): Promise<Page> {
    const page = await this.requirePageDocument(pageId, workspaceId);
    const site = await this.requireSite(page.siteId, workspaceId);
    if (site.homePageId === pageId) return this.toPageContract(page);

    // Homepage is a site-level alias. Page.path remains the page's own
    // canonical identity, so switching home never rewrites either page route.
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
      this.parsePayload(parsedInput.payload ?? parsedInput.composition?.payload),
      latestVersion?.versionNumber,
      latestVersion?._id.toString(),
      parsedInput.composition,
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

    const storedComposition = PageCompositionSchema.safeParse(version.composition);
    const payload = PagePayloadSchema.parse(
      storedComposition.success ? storedComposition.data.payload : version.payload,
    );
    const composition = this.compositionForVersion(page, version, payload, false);
    await this.reusables.assertDependenciesAvailable(
      page.workspaceId,
      page.siteId,
      payload,
    );
    const designSystem = await this.sites.getDesignSystem(page.workspaceId, page.siteId);
    await this.reusables.assertDesignTokenDependenciesAvailable(
      page.workspaceId,
      page.siteId,
      designSystem.draft,
      [payload],
    );
    await this.workflows.validatePagePublishDependencies(pageId, workspaceId);
    await this.pageExtensions.validateBeforePublish(
      pageId,
      workspaceId,
      payload,
      composition,
    );
    const publishedBundle = await this.pageExtensions.compilePublishedBundle(
      pageId,
      workspaceId,
      version.versionNumber,
      payload,
      composition,
      parseLayoutAttachments(page),
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

    return this.toPublicContract(site, page, version, true);
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

  async getLayout(pageId: string, workspaceId: string): Promise<PageLayoutAttachment[]> {
    const page = await this.requirePageDocument(pageId, workspaceId);
    return parseLayoutAttachments(page);
  }

  async updateLayout(
    pageId: string,
    attachments: PageLayoutAttachment[],
    workspaceId: string,
  ): Promise<PageLayoutAttachment[]> {
    const parsed = PageLayoutUpdateRequestSchema.parse({ attachments }).attachments;
    const page = await this.requirePageDocument(pageId, workspaceId);
    assertValidLayoutAttachments(parsed);
    await this.assertLayoutAttachmentsAvailable(page.siteId, workspaceId, parsed);
    const latestVersion = await this.findLatestVersion(pageId, workspaceId);
    if (latestVersion) {
      const storedComposition = PageCompositionSchema.safeParse(
        latestVersion.composition,
      );
      const payload = PagePayloadSchema.parse(
        storedComposition.success
          ? storedComposition.data.payload
          : latestVersion.payload,
      );
      const previous = this.compositionForVersion(page, latestVersion, payload);
      if (!previous) {
        throw new InternalServerErrorException({
          code: 'PAGE_COMPOSITION_INVALID',
          message: 'The current page composition could not be normalized',
        });
      }
      await this.persistVersion(
        page,
        payload,
        latestVersion.versionNumber,
        latestVersion._id.toString(),
        {
          pageId,
          payload,
          attachments: previous.attachments,
          layoutAttachments: parsed,
          bindings: previous.bindings,
          actions: previous.actions,
          resources: previous.resources,
        },
      );
    }
    if (parsed.length === 0) page.set('layoutAttachments', undefined);
    else page.layoutAttachments = parsed;
    await page.save();
    return parseLayoutAttachments(page);
  }

  private async persistVersion(
    page: PageDocument,
    payload: PagePayload,
    currentVersionNumber: number | undefined,
    expectedDraftVersionId: string | undefined,
    compositionInput?: PageCompositionInput,
  ): Promise<PageVersion> {
    const versionNumber = nextVersionNumber(currentVersionNumber);
    const latest = currentVersionNumber
      ? await this.versionModel
          .findOne({
            landingPageId: page._id.toString(),
            workspaceId: page.workspaceId,
            versionNumber: currentVersionNumber,
          })
          .exec()
      : null;
    const composition = this.normalizeComposition(
      page._id.toString(),
      payload,
      compositionInput,
      latest
        ? this.compositionForVersion(page, latest, this.parsePayload(latest.payload))
        : undefined,
      parseLayoutAttachments(page),
    );
    const previousLayoutAttachments = parseLayoutAttachments(page);
    let record: PageVersionDocument;
    try {
      record = await this.versionModel.create({
        _id: randomUUID(),
        workspaceId: page.workspaceId,
        siteId: page.siteId,
        landingPageId: page._id.toString(),
        versionNumber,
        payload,
        composition,
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
        {
          $set: {
            currentDraftVersionId: record._id.toString(),
            ...(composition.layoutAttachments.length
              ? { layoutAttachments: composition.layoutAttachments }
              : {}),
          },
          ...(composition.layoutAttachments.length
            ? {}
            : { $unset: { layoutAttachments: 1 } }),
        },
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
    if (composition.layoutAttachments.length > 0) {
      page.layoutAttachments = composition.layoutAttachments;
    } else {
      page.set('layoutAttachments', undefined);
    }
    try {
      await this.pageExtensions.synchronizeComposition(
        page._id.toString(),
        page.workspaceId,
        composition,
      );
    } catch (error) {
      await this.versionModel
        .deleteOne({ _id: record._id })
        .exec()
        .catch(() => undefined);
      const rollbackSet = {
        ...(expectedDraftVersionId
          ? { currentDraftVersionId: expectedDraftVersionId }
          : {}),
        ...(previousLayoutAttachments.length
          ? { layoutAttachments: previousLayoutAttachments }
          : {}),
      };
      const rollbackUnset = {
        ...(expectedDraftVersionId ? {} : { currentDraftVersionId: 1 }),
        ...(previousLayoutAttachments.length ? {} : { layoutAttachments: 1 }),
      };
      const rollbackUpdate = {
        ...(Object.keys(rollbackSet).length ? { $set: rollbackSet } : {}),
        ...(Object.keys(rollbackUnset).length ? { $unset: rollbackUnset } : {}),
      };
      await this.pageModel
        .findOneAndUpdate(
          {
            _id: page._id.toString(),
            workspaceId: page.workspaceId,
            currentDraftVersionId: record._id.toString(),
          },
          rollbackUpdate,
        )
        .exec()
        .catch(() => undefined);
      throw error;
    }
    return this.toVersionContract(record);
  }

  private async assertLayoutAttachmentsAvailable(
    siteId: string,
    workspaceId: string,
    attachments: readonly PageLayoutAttachment[],
  ): Promise<void> {
    await Promise.all(
      attachments.map((attachment) =>
        this.layoutExtensions.get(
          siteId,
          workspaceId,
          attachment.type,
          attachment.resourceId,
        ),
      ),
    );
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
      ...(parseLayoutAttachments(record).length
        ? { layoutAttachments: parseLayoutAttachments(record) }
        : {}),
      ...(record.appliedTemplate ? { appliedTemplate: record.appliedTemplate } : {}),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }

  private async toPublicContract(
    site: SiteDocument,
    page: PageDocument,
    version: PageVersionDocument,
    preview = false,
  ): Promise<PublicPage> {
    try {
      const versionContract = this.toVersionContract(version);
      const storedComposition = PageCompositionSchema.safeParse(version.composition);
      const payload = PagePayloadSchema.parse(
        storedComposition.success ? storedComposition.data.payload : version.payload,
      );
      // Review is draft-scoped. New versions use their immutable composition;
      // legacy payload-only versions are normalized from that saved payload
      // instead of consulting the mutable page-instance projection.
      const composition = this.compositionForVersion(page, version, payload);
      if (!composition) throw new Error('The draft page composition is unavailable');
      const extensions = await this.pageExtensions.resolveRuntimeForComposition(
        page._id.toString(),
        page.workspaceId,
        composition,
      );
      const reusables = await this.reusables.resolveForPayload(
        page.workspaceId,
        page.siteId,
        versionContract.payload,
        false,
      );
      const globals = preview
        ? site.globalsDraft
          ? SiteGlobalsSchema.parse(site.globalsDraft)
          : undefined
        : site.publishedGlobals
          ? SiteGlobalsSchema.parse(site.publishedGlobals)
          : undefined;
      const navigation = await this.navigation.resolveForSite(
        page.siteId,
        page.workspaceId,
        { mode: preview ? 'draft' : 'published' },
      );
      const layout = await this.layoutExtensions.resolveComposition(
        composition?.layoutAttachments ?? parseLayoutAttachments(page),
        preview ? 'draft' : 'published',
      );
      const designSystem = (preview ? site.designSystemDraft : site.publishedDesignSystem)
        ? SiteDesignSystemSchema.parse(
            preview ? site.designSystemDraft : site.publishedDesignSystem,
          )
        : undefined;
      return PublicPageSchema.parse({
        site: {
          name: site.name,
          slug: site.slug,
          ...(site.logo ? { logo: site.logo } : {}),
        },
        page: {
          name: page.name,
          ...(page.description ? { description: page.description } : {}),
          ...(page.slug ? { slug: page.slug } : {}),
        },
        payload: versionContract.payload,
        ...(extensions.length ? { extensions } : {}),
        ...(navigation ? { navigation } : {}),
        ...(layout.header || layout.footer ? { layout } : {}),
        ...(globals ? { globals } : {}),
        ...(reusables.length ? { reusables } : {}),
        ...(designSystem ? { designSystem } : {}),
      });
    } catch {
      throw this.invalidPublishedPage();
    }
  }

  private toVersionContract(record: PageVersionDocument): PageVersion {
    const composition = PageCompositionSchema.safeParse(record.composition);
    return PageVersionSchema.parse({
      id: record._id.toString(),
      workspaceId: record.workspaceId,
      siteId: record.siteId,
      landingPageId: record.landingPageId,
      versionNumber: record.versionNumber,
      payload: record.payload,
      ...(composition.success ? { composition: composition.data } : {}),
      createdAt: record.createdAt.toISOString(),
    });
  }

  private normalizeComposition(
    pageId: string,
    payload: PagePayload,
    compositionInput?: PageCompositionInput,
    previous?: PageComposition,
    legacyLayoutAttachments?: readonly PageLayoutAttachment[],
  ): PageComposition {
    try {
      return normalizePageComposition({
        pageId,
        payload,
        ...(compositionInput ? { composition: compositionInput } : {}),
        ...(previous ? { previous } : {}),
        ...(legacyLayoutAttachments ? { legacyLayoutAttachments } : {}),
      });
    } catch (error) {
      if (error instanceof PageCompositionError) {
        throw new BadRequestException({ code: error.code, message: error.message });
      }
      throw error;
    }
  }

  private compositionForVersion(
    page: PageDocument,
    version: PageVersionDocument,
    payload: PagePayload,
    normalizeLegacy = true,
  ): PageComposition | undefined {
    const parsed = PageCompositionSchema.safeParse(version.composition);
    if (
      parsed.success &&
      parsed.data.pageId === page._id.toString() &&
      JSON.stringify(parsed.data.payload) === JSON.stringify(payload)
    ) {
      return parsed.data;
    }
    if (!normalizeLegacy) return undefined;
    return this.normalizeComposition(
      page._id.toString(),
      payload,
      undefined,
      undefined,
      parseLayoutAttachments(page),
    );
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

function parseLayoutAttachments(page: PageDocument): PageLayoutAttachment[] {
  const value = page.layoutAttachments ?? [];
  const parsed = PageLayoutAttachmentsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

function assertValidLayoutAttachments(attachments: PageLayoutAttachment[]): void {
  const headerSlots = new Set([
    'page.header.top',
    'page.header.top-left',
    'page.header.top-right',
  ]);
  const footerSlots = new Set(['page.footer.bottom']);
  const headers = attachments.filter((attachment) => attachment.type === 'header');
  const footers = attachments.filter((attachment) => attachment.type === 'footer');
  if (headers.length > 1 || footers.length > 1) {
    throw new BadRequestException({
      code: 'INVALID_PAGE_LAYOUT',
      message: 'A page can attach at most one header and one footer',
    });
  }
  for (const attachment of attachments) {
    if (attachment.type === 'header' && !headerSlots.has(attachment.slot)) {
      throw new BadRequestException({
        code: 'INVALID_PAGE_LAYOUT_SLOT',
        message: `Slot ${attachment.slot} is not valid for a header attachment`,
      });
    }
    if (attachment.type === 'footer' && !footerSlots.has(attachment.slot)) {
      throw new BadRequestException({
        code: 'INVALID_PAGE_LAYOUT_SLOT',
        message: `Slot ${attachment.slot} is not valid for a footer attachment`,
      });
    }
  }
}
