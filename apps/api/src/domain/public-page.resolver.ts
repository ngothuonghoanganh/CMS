import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  PagePayloadSchema,
  PageCompositionSchema,
  PublishedPageBundleSchema,
  PublicPageSchema,
  PublicSeoSettingsSchema,
  SiteGlobalsSchema,
  SiteDesignSystemSchema,
  normalizeHostname,
  type PublicPage,
  type PageRuntimeExtension,
  normalizePagePath,
} from '@payload/contracts';

import { env } from '../config/env';
import { CustomDomainRecord } from '../persistence/schemas/custom-domain.schema';
import { PageRecord, type PageDocument } from '../persistence/schemas/page.schema';
import { PageSeoSettingsRecord } from '../persistence/schemas/page-seo-settings.schema';
import {
  PageVersionRecord,
  type PageVersionDocument,
} from '../persistence/schemas/page-version.schema';
import { SiteRecord, type SiteDocument } from '../persistence/schemas/site.schema';
import { TenantContext } from '../tenancy/tenant-context';
import { SiteUrlService } from './site-url.service';
import { NavigationService } from './navigation.service';
import { LayoutExtensionService } from './layout-extension.service';
import { ReusableService } from './reusable.service';
import { PageExtensionService } from '../extensions/page-extension.service';

@Injectable()
export class PublicPageResolver {
  constructor(
    @InjectModel(SiteRecord.name)
    private readonly siteModel: Model<SiteRecord>,
    @InjectModel(PageRecord.name)
    private readonly pageModel: Model<PageRecord>,
    @InjectModel(PageVersionRecord.name)
    private readonly versionModel: Model<PageVersionRecord>,
    @InjectModel(CustomDomainRecord.name)
    private readonly domainModel: Model<CustomDomainRecord>,
    @InjectModel(PageSeoSettingsRecord.name)
    private readonly seoModel: Model<PageSeoSettingsRecord>,
    @Inject(TenantContext) private readonly tenantContext: TenantContext,
    @Inject(SiteUrlService) private readonly siteUrls: SiteUrlService,
    @Inject(NavigationService) private readonly navigation: NavigationService,
    @Inject(LayoutExtensionService)
    private readonly layoutExtensions: LayoutExtensionService,
    @Inject(PageExtensionService)
    private readonly pageExtensions: PageExtensionService,
    @Inject(ReusableService) private readonly reusables: ReusableService,
  ) {}

  async resolveByLegacySlug(siteSlug: string, pageSlug: string): Promise<PublicPage> {
    return this.resolveByPath(siteSlug, pageSlug ? `/${pageSlug}` : '/');
  }

  async resolveByPath(siteSlug: string, path: string): Promise<PublicPage> {
    const normalizedPath = normalizePagePath(path);
    if (!normalizedPath) throw this.publicNotFound();
    const sites = await this.siteModel.find({ slug: siteSlug }).limit(2).exec();
    if (sites.length !== 1 || !sites[0]) {
      throw this.publicNotFound();
    }

    const site = sites[0];
    const page =
      normalizedPath === '/'
        ? site.homePageId
          ? await this.pageModel
              .findOne({
                _id: site.homePageId,
                siteId: site._id.toString(),
                workspaceId: site.workspaceId,
              })
              .exec()
          : await this.pageModel
              .findOne({
                siteId: site._id.toString(),
                workspaceId: site.workspaceId,
                path: '/',
              })
              .sort({ createdAt: 1, _id: 1 })
              .exec()
        : await this.pageModel
            .findOne({
              siteId: site._id.toString(),
              path: normalizedPath,
              workspaceId: site.workspaceId,
            })
            .exec();
    const legacyPage =
      page ??
      (normalizedPath === '/'
        ? null
        : await this.pageModel
            .findOne({
              siteId: site._id.toString(),
              slug: normalizedPath.slice(1),
              workspaceId: site.workspaceId,
            })
            .exec());
    if (!legacyPage) throw this.publicNotFound();

    const version = await this.findPublishedVersion(legacyPage, site);
    return this.toPublicContract(site, legacyPage, version);
  }

  async resolveByHostname(hostname: string, path = '/'): Promise<PublicPage> {
    const normalizedHostname = normalizeHostname(hostname);
    if (!normalizedHostname) throw this.publicNotFound();

    const domain = await this.domainModel
      .findOne({ normalizedHostname, hostname: normalizedHostname, status: 'active' })
      .exec();
    if (!domain) throw this.publicNotFound();
    const normalizedPath = normalizePagePath(path);
    if (!normalizedPath) throw this.publicNotFound();

    let site = domain.siteId
      ? await this.siteModel
          .findOne({ _id: domain.siteId, workspaceId: domain.workspaceId })
          .exec()
      : null;
    const assignedPage = domain.landingPageId
      ? await this.pageModel
          .findOne({ _id: domain.landingPageId, workspaceId: domain.workspaceId })
          .exec()
      : null;
    if (!site && assignedPage) {
      site = await this.siteModel
        .findOne({ _id: assignedPage.siteId, workspaceId: domain.workspaceId })
        .exec();
    }
    if (!site) throw this.publicNotFound();

    const page =
      normalizedPath === '/' && !domain.siteId && assignedPage
        ? assignedPage
        : normalizedPath === '/' && site.homePageId
          ? await this.pageModel
              .findOne({
                _id: site.homePageId,
                siteId: site._id.toString(),
                workspaceId: site.workspaceId,
              })
              .exec()
          : await this.pageModel
              .findOne({
                siteId: site._id.toString(),
                workspaceId: site.workspaceId,
                path: normalizedPath,
              })
              .exec();
    const legacyPage =
      page ??
      (normalizedPath === '/'
        ? await this.pageModel
            .findOne({
              siteId: site._id.toString(),
              workspaceId: site.workspaceId,
              path: '/',
            })
            .sort({ createdAt: 1, _id: 1 })
            .exec()
        : await this.pageModel
            .findOne({
              siteId: site._id.toString(),
              workspaceId: site.workspaceId,
              slug: normalizedPath.slice(1),
            })
            .exec());
    if (!legacyPage) throw this.publicNotFound();
    const version = await this.findPublishedVersion(legacyPage, site);
    return this.toPublicContract(site, legacyPage, version);
  }

  private async findPublishedVersion(
    page: PageDocument,
    site: SiteDocument,
  ): Promise<PageVersionDocument> {
    if (!page.publishedVersionId) throw this.publicNotFound();
    const version = await this.versionModel
      .findOne({
        _id: page.publishedVersionId,
        landingPageId: page._id.toString(),
        siteId: site._id.toString(),
        workspaceId: site.workspaceId,
      })
      .exec();
    if (!version) throw this.invalidPublishedPage();
    return version;
  }

  private async toPublicContract(
    site: SiteDocument,
    page: PageDocument,
    version: PageVersionDocument,
  ): Promise<PublicPage> {
    try {
      const publishedBundle = version.publishedBundle
        ? PublishedPageBundleSchema.parse(version.publishedBundle)
        : undefined;
      const versionComposition = PageCompositionSchema.safeParse(version.composition);
      const payload = PagePayloadSchema.parse(
        publishedBundle?.payload ??
          (versionComposition.success
            ? versionComposition.data.payload
            : version.payload),
      );
      const seoRecord = await this.seoModel
        .findOne({ workspaceId: page.workspaceId, landingPageId: page._id.toString() })
        .exec();
      const seo = seoRecord ? this.toPublicSeo(seoRecord) : undefined;
      const canonicalUrl = await this.resolveCanonicalUrl(page, seo?.canonicalUrl);
      const navigation = await this.navigation.resolveForSite(
        site._id.toString(),
        site.workspaceId,
        { mode: 'published' },
      );
      const layout = await this.layoutExtensions.resolveComposition(
        publishedBundle?.layoutAttachments ??
          (versionComposition.success ? versionComposition.data.layoutAttachments : []),
        'published',
        { siteId: site._id.toString(), workspaceId: site.workspaceId },
      );
      const globals = site.publishedGlobals
        ? SiteGlobalsSchema.parse(site.publishedGlobals)
        : undefined;
      const reusables = await this.reusables.resolveForPayload(
        page.workspaceId,
        page.siteId,
        payload,
        true,
      );
      const designSystem = site.publishedDesignSystem
        ? SiteDesignSystemSchema.parse(site.publishedDesignSystem)
        : undefined;
      // Public rendering is intentionally snapshot-only. In particular, a
      // legacy version without a compiled bundle must not fall through to the
      // mutable page extension projection from the draft.
      const extensions = mergeRuntimeExtensions(
        publishedBundle?.extensions ?? [],
        await this.pageExtensions.resolveRuntimeForLayoutDocuments(page.workspaceId, [
          ...(layout.header ? [layout.header.document] : []),
          ...(layout.footer ? [layout.footer.document] : []),
        ]),
      );

      return PublicPageSchema.parse({
        tenantSlug: this.tenantContext.require().slug,
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
        payload,
        ...(extensions.length ? { extensions } : {}),
        ...(seo ? { seo } : {}),
        ...(canonicalUrl ? { canonicalUrl } : {}),
        ...(navigation ? { navigation } : {}),
        ...(layout.header || layout.footer ? { layout } : {}),
        ...(globals ? { globals } : {}),
        ...(reusables.length ? { reusables } : {}),
        ...(designSystem ? { designSystem } : {}),
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw this.invalidPublishedPage();
    }
  }

  private toPublicSeo(record: PageSeoSettingsRecord) {
    return PublicSeoSettingsSchema.parse({
      ...(record.title ? { title: record.title } : {}),
      ...(record.description ? { description: record.description } : {}),
      ...(record.canonicalUrl ? { canonicalUrl: record.canonicalUrl } : {}),
      noIndex: record.noIndex,
      noFollow: record.noFollow,
      ...(record.ogTitle ? { ogTitle: record.ogTitle } : {}),
      ...(record.ogDescription ? { ogDescription: record.ogDescription } : {}),
      ...(record.ogImage ? { ogImage: record.ogImage } : {}),
      ...(record.twitterCard ? { twitterCard: record.twitterCard } : {}),
      ...(record.twitterTitle ? { twitterTitle: record.twitterTitle } : {}),
      ...(record.twitterDescription
        ? { twitterDescription: record.twitterDescription }
        : {}),
      ...(record.twitterImage ? { twitterImage: record.twitterImage } : {}),
      ...(record.favicon ? { favicon: record.favicon } : {}),
    });
  }

  private async resolveCanonicalUrl(
    page: PageDocument,
    explicitCanonicalUrl?: string,
  ): Promise<string | undefined> {
    const origin = new URL(env.PUBLIC_PLATFORM_ORIGIN);
    if (explicitCanonicalUrl) {
      return new URL(explicitCanonicalUrl, origin).toString();
    }

    const site = await this.siteModel
      .findOne({ _id: page.siteId, workspaceId: page.workspaceId })
      .exec();
    if (!site) return undefined;
    return this.siteUrls.getPageUrl(site, page);
  }

  private publicNotFound(): NotFoundException {
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

function mergeRuntimeExtensions(
  base: readonly PageRuntimeExtension[],
  additional: readonly PageRuntimeExtension[],
): PageRuntimeExtension[] {
  const byId = new Map(base.map((extension) => [extension.extensionId, extension]));
  for (const extension of additional) {
    if (!byId.has(extension.extensionId)) byId.set(extension.extensionId, extension);
  }
  return [...byId.values()];
}
