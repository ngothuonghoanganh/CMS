import { Module } from '@nestjs/common';
import { PagesModule } from '../pages/pages.module.js';
import { PrivacyCoreModule } from '../privacy/privacy-core.module.js';
import { SitesCoreModule } from '../sites/sites-core.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { TemplatesController } from './templates.controller.js';
import { TemplatesService } from './templates.service.js';

/**
 * The template library (ADR-030). System templates live in `@plp/sections/schema`; this module
 * lists them, previews one, counts the pages made from it (pages) and says what a site still needs
 * for its form (sites, consent versions). Creating a page from one is in the pages module.
 */
@Module({
  imports: [WorkspacesModule, SitesCoreModule, PagesModule, PrivacyCoreModule],
  controllers: [TemplatesController],
  providers: [TemplatesService],
})
export class TemplatesModule {}
