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
  PublicLandingPageSchema,
  PublicSeoSettingsSchema,
  normalizeHostname,
  type PublicLandingPage,
} from '@payload/contracts';

import { env } from '../config/env';
import { CustomDomainRecord } from '../persistence/schemas/custom-domain.schema';
import {
  LandingPageRecord,
  type LandingPageDocument,
} from '../persistence/schemas/landing-page.schema';
import { PageSeoSettingsRecord } from '../persistence/schemas/page-seo-settings.schema';
import {
  PageVersionRecord,
  type PageVersionDocument,
} from '../persistence/schemas/page-version.schema';
import { SiteRecord, type SiteDocument } from '../persistence/schemas/site.schema';
import { TenantContext } from '../tenancy/tenant-context';

@Injectable()
export class PublicPageResolver {
  constructor(
    @InjectModel(SiteRecord.name)
    private readonly siteModel: Model<SiteRecord>,
    @InjectModel(LandingPageRecord.name)
    private readonly pageModel: Model<LandingPageRecord>,
    @InjectModel(PageVersionRecord.name)
    private readonly versionModel: Model<PageVersionRecord>,
    @InjectModel(CustomDomainRecord.name)
    private readonly domainModel: Model<CustomDomainRecord>,
    @InjectModel(PageSeoSettingsRecord.name)
    private readonly seoModel: Model<PageSeoSettingsRecord>,
    @Inject(TenantContext) private readonly tenantContext: TenantContext,
  ) {}

  async resolveByPath(siteSlug: string, pageSlug: string): Promise<PublicLandingPage> {
    const sites = await this.siteModel.find({ slug: siteSlug }).limit(2).exec();
    if (sites.length !== 1 || !sites[0]) {
      throw this.publicNotFound();
    }

    const site = sites[0];
    const page = await this.pageModel
      .findOne({
        siteId: site._id.toString(),
        slug: pageSlug,
        workspaceId: site.workspaceId,
      })
      .exec();
    if (!page) throw this.publicNotFound();

    const version = await this.findPublishedVersion(page, site);
    return this.toPublicContract(site, page, version);
  }

  async resolveByHostname(hostname: string): Promise<PublicLandingPage> {
    const normalizedHostname = normalizeHostname(hostname);
    if (!normalizedHostname) throw this.publicNotFound();

    const domain = await this.domainModel
      .findOne({ normalizedHostname, hostname: normalizedHostname, status: 'active' })
      .exec();
    if (!domain?.landingPageId) throw this.publicNotFound();
    const page = await this.pageModel
      .findOne({ _id: domain.landingPageId, workspaceId: domain.workspaceId })
      .exec();
    if (!page) throw this.publicNotFound();

    const site = await this.siteModel
      .findOne({ _id: page.siteId, workspaceId: domain.workspaceId })
      .exec();
    if (!site) throw this.publicNotFound();

    const version = await this.findPublishedVersion(page, site);
    return this.toPublicContract(site, page, version);
  }

  private async findPublishedVersion(
    page: LandingPageDocument,
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
    page: LandingPageDocument,
    version: PageVersionDocument,
  ): Promise<PublicLandingPage> {
    try {
      const payload = PagePayloadSchema.parse(version.payload);
      const seoRecord = await this.seoModel
        .findOne({ workspaceId: page.workspaceId, landingPageId: page._id.toString() })
        .exec();
      const seo = seoRecord ? this.toPublicSeo(seoRecord) : undefined;
      const canonicalUrl = await this.resolveCanonicalUrl(page, seo?.canonicalUrl);

      return PublicLandingPageSchema.parse({
        tenantSlug: this.tenantContext.require().slug,
        site: { name: site.name, slug: site.slug },
        page: {
          name: page.name,
          ...(page.slug ? { slug: page.slug } : {}),
        },
        payload,
        ...(seo ? { seo } : {}),
        ...(canonicalUrl ? { canonicalUrl } : {}),
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
    page: LandingPageDocument,
    explicitCanonicalUrl?: string,
  ): Promise<string | undefined> {
    const origin = new URL(env.PUBLIC_PLATFORM_ORIGIN);
    if (explicitCanonicalUrl) {
      return new URL(explicitCanonicalUrl, origin).toString();
    }

    const primaryDomain = await this.domainModel
      .findOne({
        workspaceId: page.workspaceId,
        landingPageId: page._id.toString(),
        status: 'active',
        isPrimary: true,
      })
      .exec();
    if (primaryDomain) {
      return `https://${primaryDomain.hostname}/`;
    }

    return undefined;
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
