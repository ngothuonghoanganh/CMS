import { Controller, Get, Inject, Param, Query } from '@nestjs/common';

import { PublicPageResolver } from './public-page.resolver';

@Controller('public/sites')
export class PublicPageController {
  constructor(@Inject(PublicPageResolver) private readonly pages: PublicPageResolver) {}

  @Get(':siteSlug/pages/:pageSlug')
  async getPublicPage(
    @Param('siteSlug') siteSlug: string,
    @Param('pageSlug') pageSlug: string,
  ) {
    return this.pages.resolveByLegacySlug(siteSlug, pageSlug);
  }

  @Get(':siteSlug')
  async getPublicHomePage(@Param('siteSlug') siteSlug: string) {
    return this.pages.resolveByPath(siteSlug, '/');
  }

  @Get(':siteSlug/resolve')
  async resolvePublicPage(
    @Param('siteSlug') siteSlug: string,
    @Query('path') path = '/',
  ) {
    return this.pages.resolveByPath(siteSlug, path);
  }
}
