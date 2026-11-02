import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module.js';
import { AssetsModule } from '../assets/assets.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { LeadsCoreModule } from '../leads/leads-core.module.js';
import { PrivacyCoreModule } from '../privacy/privacy-core.module.js';
import { PublishingCoreModule } from '../publishing/publishing-core.module.js';
import { SitesCoreModule } from '../sites/sites-core.module.js';
import { PageAccessService } from './page-access.service.js';
import { PageDeletionService } from './page-deletion.service.js';
import { PageEvaluator } from './page-evaluator.service.js';
import { PAGE_COLLECTION } from './page.schema.js';
import { PagesController } from './pages.controller.js';
import { PagesRepository } from './pages.repository.js';
import { PagesService } from './pages.service.js';
import { WorkspaceCollectionsModule } from '../../shared/persistence/workspace-databases.js';

/**
 * Pages and their drafts. Exports page access, persistence and evaluation (status + checks) to
 * publishing, preview and public delivery, which build on pages.
 */
@Module({
  imports: [
    WorkspaceCollectionsModule.forFeature([PAGE_COLLECTION]),
    ActivityModule,
    AssetsModule,
    AuthModule,
    LeadsCoreModule,
    PrivacyCoreModule,
    PublishingCoreModule,
    SitesCoreModule,
  ],
  controllers: [PagesController],
  providers: [PagesRepository, PageAccessService, PageEvaluator, PagesService, PageDeletionService],
  exports: [PagesRepository, PageAccessService, PageEvaluator],
})
export class PagesModule {}
