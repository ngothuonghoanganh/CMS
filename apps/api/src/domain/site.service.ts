import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';

import {
  PaginationQuerySchema,
  SiteListResponseSchema,
  SiteSchema,
  SitePublishResponseSchema,
  type CreateSiteRequest,
  type PaginationQuery,
  type Site,
  type SitePublishResponse,
  type SiteListResponse,
  SiteManifestSchema,
  normalizePagePath,
  normalizeUrlSlug,
  type SiteManifest,
  type UpdateSiteRequest,
  PagePayloadSchema,
  SiteGlobalsSchema,
  SiteGlobalsResponseSchema,
  cloneSiteGlobals,
  type SiteGlobals,
  type SiteGlobalsResponse,
  SiteDesignSystemSchema,
  SiteDesignSystemResponseSchema,
  createDefaultSiteDesignSystem,
  type SiteDesignSystem,
  type SiteDesignSystemResponse,
} from '@payload/contracts';

import { DomainError } from './domain-error';
import { SiteRecord, type SiteDocument } from '../persistence/schemas/site.schema';
import { WorkspaceRecord } from '../persistence/schemas/workspace.schema';
import { PageRecord, type PageDocument } from '../persistence/schemas/page.schema';
import { PageVersionRecord } from '../persistence/schemas/page-version.schema';
import { NavigationRecord } from '../persistence/schemas/navigation.schema';
import { QuotaService } from '../billing/quota.service';
import { SiteUrlService } from './site-url.service';
import { TenantContext } from '../tenancy/tenant-context';
import { TenantResolver } from '../tenancy/tenant-resolver';
import { ReusableService } from './reusable.service';

@Injectable()
export class SiteService {
  constructor(
    @InjectModel(SiteRecord.name)
    private readonly siteModel: Model<SiteRecord>,
    @InjectModel(WorkspaceRecord.name)
    private readonly workspaceModel: Model<WorkspaceRecord>,
    @InjectModel(PageRecord.name)
    private readonly pageModel: Model<PageRecord>,
    @InjectModel(PageVersionRecord.name)
    private readonly versionModel: Model<PageVersionRecord>,
    @InjectModel(NavigationRecord.name)
    private readonly navigationModel: Model<NavigationRecord>,
    @Inject(QuotaService) private readonly quotas: QuotaService,
    @Inject(SiteUrlService) private readonly siteUrls: SiteUrlService,
    @Inject(TenantContext) private readonly tenantContext: TenantContext,
    @Inject(TenantResolver) private readonly tenantResolver: TenantResolver,
    @Inject(ReusableService) private readonly reusables: ReusableService,
  ) {}

  async create(workspaceId: string, input: CreateSiteRequest): Promise<Site> {
    await this.requireWorkspace(workspaceId);
    return this.quotas.withHardQuota('landing_pages', async () => {
      const slug = normalizeUrlSlug(input.slug);
      if (!slug) {
        throw new BadRequestException({
          code: 'INVALID_SITE_SLUG',
          message: 'Site URL must contain at least one URL-safe character',
        });
      }
      const record = await this.siteModel.create({
        _id: randomUUID(),
        workspaceId,
        name: input.name,
        slug,
        ...(input.logo ? { logo: input.logo } : {}),
      });
      try {
        await this.ensureHomePage(record);
        await this.registerPublicRoute(record);
      } catch (error) {
        // Mongo deployments without replica-set transactions still get a
        // compensating cleanup, so a failed bootstrap cannot leave a site that
        // violates the homepage invariant.
        await this.versionModel.deleteMany({ siteId: record._id.toString() }).exec();
        await this.pageModel.deleteMany({ siteId: record._id.toString() }).exec();
        await record.deleteOne().exec();
        throw error;
      }
      return this.toContract(record);
    });
  }

  async list(workspaceId: string, input: PaginationQuery): Promise<SiteListResponse> {
    await this.requireWorkspace(workspaceId);
    const query = PaginationQuerySchema.parse(input);
    const [records, total] = await Promise.all([
      this.siteModel
        .find({ workspaceId })
        .sort({ createdAt: -1, _id: -1 })
        .skip(query.offset)
        .limit(query.limit)
        .exec(),
      this.siteModel.countDocuments({ workspaceId }).exec(),
    ]);

    await Promise.all(records.map((record) => this.ensureHomePage(record)));
    return SiteListResponseSchema.parse({
      items: await Promise.all(records.map((record) => this.toContract(record))),
      pagination: {
        ...query,
        hasNextPage: query.offset + records.length < total,
        total,
      },
    });
  }

  async getById(workspaceId: string, siteId: string): Promise<Site> {
    const record = await this.siteModel.findOne({ _id: siteId, workspaceId }).exec();

    if (!record) {
      throw new NotFoundException({
        code: 'SITE_NOT_FOUND',
        message: `Site ${siteId} was not found in workspace ${workspaceId}`,
      });
    }

    await this.ensureHomePage(record);
    return this.toContract(record);
  }

  async update(
    workspaceId: string,
    siteId: string,
    input: UpdateSiteRequest,
  ): Promise<Site> {
    const record = await this.siteModel.findOne({ _id: siteId, workspaceId }).exec();

    if (!record) {
      throw new NotFoundException({
        code: 'SITE_NOT_FOUND',
        message: `Site ${siteId} was not found in workspace ${workspaceId}`,
      });
    }

    const previousSlug = record.slug;
    const nextSlug =
      input.slug === undefined ? previousSlug : normalizeUrlSlug(input.slug);
    if (!nextSlug) {
      throw new BadRequestException({
        code: 'INVALID_SITE_SLUG',
        message: 'Site URL must contain at least one URL-safe character',
      });
    }
    if (input.name !== undefined) record.name = input.name;
    if (input.slug !== undefined) record.slug = nextSlug;
    if (input.logo !== undefined) {
      if (input.logo === null) delete record.logo;
      else record.logo = input.logo;
    }
    const slugChanged = nextSlug !== previousSlug;
    if (slugChanged) await this.registerPublicRoute(record);
    try {
      await record.save();
    } catch (error) {
      if (slugChanged) {
        await this.registerPublicRoute({
          _id: record._id,
          slug: previousSlug,
          workspaceId: record.workspaceId,
        }).catch(() => undefined);
      }
      if (isDuplicateKeyError(error))
        throw new ConflictException({
          code: 'DUPLICATE_SITE_SLUG',
          message: 'A site with this URL already exists in the workspace',
        });
      throw error;
    }
    await this.ensureHomePage(record);
    return this.toContract(record);
  }

  async publish(workspaceId: string, siteId: string): Promise<SitePublishResponse> {
    const record = await this.siteModel.findOne({ _id: siteId, workspaceId }).exec();

    if (!record) {
      throw new NotFoundException({
        code: 'SITE_NOT_FOUND',
        message: `Site ${siteId} was not found in workspace ${workspaceId}`,
      });
    }
    if (record.status === 'archived') {
      throw new ConflictException({
        code: 'SITE_ARCHIVED',
        message: 'An archived site cannot be published',
      });
    }

    const designSystem = this.readDesignSystem(record.designSystemDraft);
    await this.reusables.assertDesignTokenDependenciesAvailable(
      workspaceId,
      siteId,
      designSystem,
    );
    await this.reusables.publishReferencedForSite(workspaceId, siteId);
    const draftGlobals = record.globalsDraft
      ? this.readGlobals(record.globalsDraft)
      : undefined;
    const publishedGlobals = record.publishedGlobals
      ? this.readGlobals(record.publishedGlobals)
      : undefined;
    record.publishedGlobals = cloneSiteGlobals(
      draftGlobals ?? publishedGlobals ?? { version: 1 },
    );
    record.publishedDesignSystem = designSystem;
    record.status = 'published';
    await record.save();
    return SitePublishResponseSchema.parse(await this.toContract(record));
  }

  async getGlobals(workspaceId: string, siteId: string): Promise<SiteGlobalsResponse> {
    const record = await this.siteModel.findOne({ _id: siteId, workspaceId }).exec();
    if (!record) {
      throw new NotFoundException({
        code: 'SITE_NOT_FOUND',
        message: `Site ${siteId} was not found in workspace ${workspaceId}`,
      });
    }
    const draft = record.globalsDraft
      ? this.readGlobals(record.globalsDraft)
      : { version: 1 as const };
    const published = record.publishedGlobals
      ? this.readGlobals(record.publishedGlobals)
      : undefined;
    return SiteGlobalsResponseSchema.parse({
      draft,
      ...(published ? { published } : {}),
    });
  }

  async updateGlobals(
    workspaceId: string,
    siteId: string,
    input: SiteGlobals,
  ): Promise<SiteGlobalsResponse> {
    const record = await this.siteModel.findOne({ _id: siteId, workspaceId }).exec();
    if (!record) {
      throw new NotFoundException({
        code: 'SITE_NOT_FOUND',
        message: `Site ${siteId} was not found in workspace ${workspaceId}`,
      });
    }
    const globals = SiteGlobalsSchema.parse(input);
    record.globalsDraft = cloneSiteGlobals(globals);
    await record.save();
    return this.getGlobals(workspaceId, siteId);
  }

  async getDesignSystem(
    workspaceId: string,
    siteId: string,
  ): Promise<SiteDesignSystemResponse> {
    const record = await this.siteModel.findOne({ _id: siteId, workspaceId }).exec();
    if (!record) {
      throw new NotFoundException({
        code: 'SITE_NOT_FOUND',
        message: `Site ${siteId} was not found in workspace ${workspaceId}`,
      });
    }
    const draft = this.readDesignSystem(record.designSystemDraft);
    const published = record.publishedDesignSystem
      ? this.readDesignSystem(record.publishedDesignSystem)
      : undefined;
    return SiteDesignSystemResponseSchema.parse({
      draft,
      ...(published ? { published } : {}),
    });
  }

  async updateDesignSystem(
    workspaceId: string,
    siteId: string,
    input: SiteDesignSystem,
  ): Promise<SiteDesignSystemResponse> {
    const record = await this.siteModel.findOne({ _id: siteId, workspaceId }).exec();
    if (!record) {
      throw new NotFoundException({
        code: 'SITE_NOT_FOUND',
        message: `Site ${siteId} was not found in workspace ${workspaceId}`,
      });
    }
    const designSystem = SiteDesignSystemSchema.parse(input);
    await this.reusables.assertDesignTokenRemovalSafe(workspaceId, siteId, designSystem);
    record.designSystemDraft = designSystem;
    await record.save();
    return this.getDesignSystem(workspaceId, siteId);
  }

  async getDesignTokenUsage(workspaceId: string, siteId: string, tokenId: string) {
    return this.reusables.getDesignTokenUsage(workspaceId, siteId, tokenId);
  }

  async getOfficialUrl(workspaceId: string, siteId: string) {
    const site = await this.siteModel.findOne({ _id: siteId, workspaceId }).exec();
    if (!site) {
      throw new NotFoundException({
        code: 'SITE_NOT_FOUND',
        message: `Site ${siteId} was not found`,
      });
    }
    await this.ensureHomePage(site);
    const state = await this.siteUrls.getState(site);
    return { siteId, url: state.url, published: state.published };
  }

  async getManifest(workspaceId: string, siteId: string): Promise<SiteManifest> {
    const site = await this.siteModel.findOne({ _id: siteId, workspaceId }).exec();
    if (!site) {
      throw new NotFoundException({
        code: 'SITE_NOT_FOUND',
        message: 'Site was not found',
      });
    }
    const home = await this.resolveHomePage(site);
    if (!home)
      throw new NotFoundException({
        code: 'SITE_HOMEPAGE_REQUIRED',
        message: 'The site has no homepage',
      });
    const pages = await this.pageModel.find({ siteId, workspaceId }).exec();
    const routes: Record<string, string> = {};
    let publishedAt: Date | undefined;
    if (home.publishedVersionId) routes['/'] = home._id.toString();
    for (const page of pages) {
      if (!page.publishedVersionId) continue;
      const path = normalizePagePath(page.path ?? (page.slug ? `/${page.slug}` : ''));
      if (!path) continue;
      if (path === '/') {
        if (page._id.toString() !== home._id.toString()) continue;
      }
      routes[path] = page._id.toString();
      const version = await this.versionModel
        .findOne({ _id: page.publishedVersionId, landingPageId: page._id })
        .select({ createdAt: 1 })
        .exec();
      if (version?.createdAt && (!publishedAt || version.createdAt > publishedAt)) {
        publishedAt = version.createdAt;
      }
    }
    const navigations = await this.navigationModel.find({ siteId, workspaceId }).exec();
    const main = navigations.find((navigation) => navigation.key === 'main');
    const footer = navigations.find((navigation) => navigation.key === 'footer');
    return SiteManifestSchema.parse({
      version: 1,
      siteId,
      homePageId: home._id.toString(),
      routes,
      navigation: {
        ...(main ? { main: main._id.toString() } : {}),
        ...(footer ? { footer: footer._id.toString() } : {}),
      },
      globals: {},
      ...(publishedAt ? { publishedAt: publishedAt.toISOString() } : {}),
    });
  }

  /** Idempotent legacy repair and new-site homepage creation. */
  async ensureHomePage(site: SiteDocument): Promise<PageDocument> {
    const siteId = site._id.toString();
    const pointedHome = site.homePageId
      ? await this.pageModel
          .findOne({
            _id: site.homePageId,
            siteId,
            workspaceId: site.workspaceId,
          })
          .exec()
      : null;
    if (pointedHome) return pointedHome;

    const existingRoot = await this.pageModel
      .findOne({ siteId, workspaceId: site.workspaceId, path: '/' })
      .sort({ createdAt: 1, _id: 1 })
      .exec();
    if (existingRoot) {
      if (site.homePageId !== existingRoot._id.toString()) {
        site.homePageId = existingRoot._id.toString();
        await site.save();
      }
      await this.backfillLegacyPaths(site, existingRoot._id.toString());
      return existingRoot;
    }

    const oldestPage = await this.pageModel
      .findOne({ siteId, workspaceId: site.workspaceId })
      .sort({ createdAt: 1, _id: 1 })
      .exec();

    if (oldestPage) {
      try {
        oldestPage.path = '/';
        await oldestPage.save();
      } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
        throw new ConflictException({
          code: 'DUPLICATE_PAGE_PATH',
          message: 'The site already has a homepage route',
        });
      }
      site.homePageId = oldestPage._id.toString();
      await site.save();
      await this.backfillLegacyPaths(site, oldestPage._id.toString());
      return oldestPage;
    }

    const pageId = randomUUID();
    const versionId = randomUUID();
    const payload = PagePayloadSchema.parse({
      version: 1,
      metadata: { documentTitle: site.name },
      root: { id: 'root', type: 'root', props: {}, children: [] },
    });
    const home = await this.pageModel.create({
      _id: pageId,
      workspaceId: site.workspaceId,
      siteId,
      name: 'Home',
      path: '/',
      kind: 'system',
    });
    await this.versionModel.create({
      _id: versionId,
      workspaceId: site.workspaceId,
      siteId,
      landingPageId: pageId,
      versionNumber: 1,
      payload,
    });
    home.currentDraftVersionId = versionId;
    await home.save();
    site.homePageId = pageId;
    await site.save();
    return home;
  }

  /** Read-only homepage lookup used by public delivery and URL generation. */
  async resolveHomePage(site: SiteDocument): Promise<PageDocument | null> {
    if (site.homePageId) {
      const pointed = await this.pageModel
        .findOne({
          _id: site.homePageId,
          siteId: site._id.toString(),
          workspaceId: site.workspaceId,
        })
        .exec();
      if (pointed) return pointed;
    }

    // Compatibility-only read for old records. It deliberately does not save
    // the site or page; repair belongs to an explicit management/migration flow.
    return this.pageModel
      .findOne({ siteId: site._id.toString(), workspaceId: site.workspaceId, path: '/' })
      .sort({ createdAt: 1, _id: 1 })
      .exec();
  }

  private async registerPublicRoute(site: {
    _id: { toString(): string };
    slug: string;
    workspaceId: string;
  }): Promise<void> {
    const tenant = this.tenantContext.require();
    await this.tenantResolver.registerPublicSiteRoute({
      siteSlug: site.slug,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      databaseKey: tenant.databaseKey,
      workspaceId: site.workspaceId,
      siteId: site._id.toString(),
    });
  }

  private async backfillLegacyPaths(
    site: SiteDocument,
    homePageId: string,
  ): Promise<void> {
    const pages = await this.pageModel
      .find({ siteId: site._id.toString(), workspaceId: site.workspaceId })
      .sort({ createdAt: 1, _id: 1 })
      .exec();
    const used = new Set<string>(['/']);
    for (const page of pages) {
      if (page._id.toString() === homePageId) continue;
      const current = page.path ? normalizePagePath(page.path) : null;
      if (current && current !== '/' && !used.has(current)) {
        used.add(current);
        if (page.path !== current) {
          page.path = current;
          await page.save();
        }
        continue;
      }

      const base =
        slugifyLegacyPath(page.slug ?? page.name) ||
        `page-${page._id.toString().slice(-12)}`;
      let candidate =
        normalizePagePath(`/${base}`) ?? `/page-${page._id.toString().slice(-12)}`;
      let suffix = 1;
      while (used.has(candidate) || candidate === '/') {
        suffix += 1;
        candidate =
          normalizePagePath(`/${base}-${suffix}`) ??
          `/page-${page._id.toString().slice(-12)}-${suffix}`;
      }
      page.path = candidate;
      used.add(candidate);
      await page.save();
    }
  }

  private async requireWorkspace(workspaceId: string): Promise<void> {
    const workspace = await this.workspaceModel.exists({ _id: workspaceId });

    if (!workspace) {
      throw new NotFoundException({
        code: 'WORKSPACE_NOT_FOUND',
        message: `Workspace ${workspaceId} was not found`,
      });
    }
  }

  private async toContract(record: SiteDocument): Promise<Site> {
    try {
      const home = await this.resolveHomePage(record);
      if (!home) throw new Error('SITE_HOMEPAGE_REQUIRED');
      const urlState = await this.siteUrls.getState(record);
      return SiteSchema.parse({
        id: record._id.toString(),
        workspaceId: record.workspaceId,
        name: record.name,
        slug: record.slug,
        homePageId: home._id.toString(),
        status:
          record.status === 'archived'
            ? 'archived'
            : record.status === 'published'
              ? 'published'
              : 'draft',
        ...(record.logo ? { logo: record.logo } : {}),
        ...(urlState.url ? { officialUrl: urlState.url } : {}),
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
      });
    } catch {
      throw new DomainError(
        'INVALID_PERSISTED_SITE',
        'Persisted site data is invalid',
        500,
      );
    }
  }

  private readGlobals(value: unknown): SiteGlobals {
    if (!value) return { version: 1 };
    const parsed = SiteGlobalsSchema.safeParse(value);
    if (!parsed.success) {
      throw new DomainError(
        'INVALID_PERSISTED_SITE_GLOBALS',
        'Persisted site global data is invalid',
        500,
      );
    }
    return parsed.data;
  }

  private readDesignSystem(value: unknown): SiteDesignSystem {
    if (!value) return createDefaultSiteDesignSystem();
    const parsed = SiteDesignSystemSchema.safeParse(value);
    if (!parsed.success) {
      throw new DomainError(
        'INVALID_PERSISTED_SITE_DESIGN_SYSTEM',
        'Persisted site design system is invalid',
        500,
      );
    }
    return parsed.data;
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

function slugifyLegacyPath(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}
