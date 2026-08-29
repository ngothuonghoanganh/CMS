import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { normalizePagePath } from '@payload/contracts';

import { env } from '../config/env';
import { CustomDomainRecord } from '../persistence/schemas/custom-domain.schema';
import { PageRecord } from '../persistence/schemas/page.schema';
import type { SiteDocument } from '../persistence/schemas/site.schema';

export type SiteUrlState = {
  url?: string;
  published: boolean;
};

/** The one URL policy shared by public delivery, SEO and the CMS. */
@Injectable()
export class SiteUrlService {
  constructor(
    @InjectModel(CustomDomainRecord.name)
    private readonly domainModel: Model<CustomDomainRecord>,
    @InjectModel(PageRecord.name)
    private readonly pageModel: Model<PageRecord>,
  ) {}

  async getOfficialSiteUrl(site: SiteDocument): Promise<string | undefined> {
    return (await this.getState(site)).url;
  }

  async getState(site: SiteDocument): Promise<SiteUrlState> {
    const home = await this.findHomePage(site);
    const published = Boolean(home?.publishedVersionId);
    if (!published) return { published: false };

    const domain = await this.domainModel
      .findOne({
        workspaceId: site.workspaceId,
        status: 'active',
        isPrimary: true,
        $or: [
          { siteId: site._id.toString() },
          ...(home ? [{ landingPageId: home._id.toString() }] : []),
        ],
      })
      .sort({ siteId: -1, createdAt: 1 })
      .exec();

    if (domain) return { url: `https://${domain.hostname}/`, published: true };

    const origin = new URL(env.PUBLIC_PLATFORM_ORIGIN);
    origin.pathname = `/${site.slug}`;
    origin.search = '';
    origin.hash = '';
    return { url: origin.toString().replace(/\/$/, ''), published: true };
  }

  async getPageUrl(site: SiteDocument, page: PageRecord): Promise<string | undefined> {
    const siteUrl = await this.getOfficialSiteUrl(site);
    if (!siteUrl) return undefined;
    const base = new URL(siteUrl);
    const isHomepage = site.homePageId === page._id.toString();
    const normalizedPath = isHomepage
      ? '/'
      : (normalizePagePath(page.path ?? (page.slug ? `/${page.slug}` : '')) ?? '/');
    if (normalizedPath === '/') {
      base.pathname = base.pathname.replace(/\/$/, '') || '/';
    } else {
      base.pathname = `${base.pathname.replace(/\/$/, '')}${normalizedPath}`;
    }
    base.search = '';
    base.hash = '';
    return base.toString();
  }

  async findHomePage(site: SiteDocument): Promise<PageRecord | null> {
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

    return this.pageModel
      .findOne({ siteId: site._id.toString(), workspaceId: site.workspaceId, path: '/' })
      .exec();
  }
}
