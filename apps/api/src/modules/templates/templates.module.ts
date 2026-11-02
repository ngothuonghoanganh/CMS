import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module.js';
import { AssetsModule } from '../assets/assets.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PagesModule } from '../pages/pages.module.js';
import { PrivacyCoreModule } from '../privacy/privacy-core.module.js';
import { PublishingCoreModule } from '../publishing/publishing-core.module.js';
import { SitesCoreModule } from '../sites/sites-core.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { TemplatesController } from './templates.controller.js';
import { TemplatesCoreModule } from './templates-core.module.js';
import { TemplatesService } from './templates.service.js';
import { WorkspaceTemplatesController } from './workspace-templates.controller.js';
import { WorkspaceTemplatesService } from './workspace-templates.service.js';

/**
 * The template library (ADR-030). System templates live in `@plp/sections/schema`, the workspace's
 * own in its database (`TemplatesCoreModule`). This module lists and previews both, counts the
 * pages made from them (pages), says what a site still needs for a form (sites, consent versions),
 * and saves a page's draft or live release as a workspace template (releases, activity). Making a
 * page or a draft from a template is in the pages module.
 */
@Module({
  imports: [
    WorkspacesModule,
    SitesCoreModule,
    PagesModule,
    PrivacyCoreModule,
    PublishingCoreModule,
    ActivityModule,
    AssetsModule,
    AuthModule,
    TemplatesCoreModule,
  ],
  controllers: [TemplatesController, WorkspaceTemplatesController],
  providers: [TemplatesService, WorkspaceTemplatesService],
})
export class TemplatesModule {}
