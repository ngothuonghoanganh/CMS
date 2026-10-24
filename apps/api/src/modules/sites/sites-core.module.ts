import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { SITE_MODEL, siteSchema } from './site.schema.js';
import { SitesRepository } from './sites.repository.js';
import { SitesService } from './sites.service.js';

/**
 * Site data and site access, without HTTP. Every module with site-scoped endpoints (activity,
 * assets, pages, publishing…) imports this module for `SitesService.access`.
 *
 * It is separate from `SitesModule` because the site settings endpoints depend on assets and
 * activity, which themselves need site access: one module would make a cycle.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: SITE_MODEL, schema: siteSchema }]),
    WorkspacesModule,
  ],
  providers: [SitesRepository, SitesService],
  exports: [SitesRepository, SitesService],
})
export class SitesCoreModule {}
