import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module.js';
import { AssetsModule } from '../assets/assets.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { SiteManagementService } from './site-management.service.js';
import { SitesCoreModule } from './sites-core.module.js';
import { SitesController } from './sites.controller.js';

/**
 * Site HTTP endpoints. Other modules import `SitesCoreModule` for `SitesService.access` and
 * `SitesRepository`; this module re-exports it for convenience.
 */
@Module({
  imports: [SitesCoreModule, WorkspacesModule, ActivityModule, AssetsModule],
  controllers: [SitesController],
  providers: [SiteManagementService],
  exports: [SitesCoreModule],
})
export class SitesModule {}
