import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';

import {
  PaginationQuerySchema,
  SiteListResponseSchema,
  SiteSchema,
  type CreateSiteRequest,
  type PaginationQuery,
  type Site,
  type SiteListResponse,
  SiteManifestSchema,
  normalizePagePath,
  type SiteManifest,
  type UpdateSiteRequest,
  PagePayloadSchema,
} from '@payload/contracts';

import { DomainError } from './domain-error';
import { SiteRecord, type SiteDocument } from '../persistence/schemas/site.schema';
import { WorkspaceRecord } from '../persistence/schemas/workspace.schema';
import { PageRecord, type PageDocument } from '../persistence/schemas/page.schema';
import { PageVersionRecord } from '../persistence/schemas/page-version.schema';
import { NavigationRecord } from '../persistence/schemas/navigation.schema';
import { QuotaService } from '../billing/quota.service';
import { SiteUrlService } from './site-url.service';

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
  ) {}

  async create(workspaceId: string, input: CreateSiteRequest): Promise<Site> {
    await this.requireWorkspace(workspaceId);
    return this.quotas.withHardQuota('landing_pages', async () => {
      const record = await this.siteModel.create({
        _id: randomUUID(),
        workspaceId,
        ...input,
      });
      try {
        await this.ensureHomePage(record);
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
    const record = await this.siteModel
      .findOneAndUpdate(
        { _id: siteId, workspaceId },
        {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
        },
        { new: true, runValidators: true },
      )
      .exec();

    if (!record) {
      throw new NotFoundException({
        code: 'SITE_NOT_FOUND',
        message: `Site ${siteId} was not found in workspace ${workspaceId}`,
      });
    }

    await this.ensureHomePage(record);
    return this.toContract(record);
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
    const home = await this.ensureHomePage(site);
    const pages = await this.pageModel.find({ siteId, workspaceId }).exec();
    const routes: Record<string, string> = {};
    let publishedAt: Date | undefined;
    for (const page of pages) {
      if (!page.publishedVersionId) continue;
      const path = normalizePagePath(page.path ?? (page.slug ? `/${page.slug}` : '/'));
      if (!path) continue;
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

    const pointedHome = site.homePageId
      ? await this.pageModel
          .findOne({
            _id: site.homePageId,
            siteId,
            workspaceId: site.workspaceId,
          })
          .exec()
      : null;
    const oldestPage =
      pointedHome ??
      (await this.pageModel
        .findOne({ siteId, workspaceId: site.workspaceId })
        .sort({ createdAt: 1, _id: 1 })
        .exec());

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
      const home = await this.ensureHomePage(record);
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
            : urlState.published
              ? 'published'
              : 'draft',
        ...(record.primaryNavigationId
          ? { primaryNavigationId: record.primaryNavigationId }
          : {}),
        ...(record.footerNavigationId
          ? { footerNavigationId: record.footerNavigationId }
          : {}),
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
