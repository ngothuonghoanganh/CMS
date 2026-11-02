import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module.js';
import { AssetsModule } from '../assets/assets.module.js';
import { LeadsCoreModule } from '../leads/leads-core.module.js';
import { PagesModule } from '../pages/pages.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { SiteListService } from './site-list.service.js';
import { SiteManagementService } from './site-management.service.js';
import { SitesCoreModule } from './sites-core.module.js';
import { SitesController } from './sites.controller.js';

/**
 * Site HTTP endpoints. Other modules import `SitesCoreModule` for `SitesService.access` and
 * `SitesRepository`; this module re-exports it for convenience. The site list counts pages and
 * leads (ADR-028), which build on site access themselves.
 */
@Module({
  imports: [
    SitesCoreModule,
    WorkspacesModule,
    ActivityModule,
    AssetsModule,
    LeadsCoreModule,
    PagesModule,
  ],
  controllers: [SitesController],
  providers: [SiteManagementService, SiteListService],
  exports: [SitesCoreModule],
})
export class SitesModule {}
