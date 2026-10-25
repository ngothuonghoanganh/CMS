import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ActivityModule } from '../activity/activity.module.js';
import { AssetsModule } from '../assets/assets.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { LeadsCoreModule } from '../leads/leads-core.module.js';
import { PrivacyCoreModule } from '../privacy/privacy-core.module.js';
import { PublishingCoreModule } from '../publishing/publishing-core.module.js';
import { SitesCoreModule } from '../sites/sites-core.module.js';
import { PageAccessService } from './page-access.service.js';
import { PageEvaluator } from './page-evaluator.service.js';
import { PAGE_MODEL, pageSchema } from './page.schema.js';
import { PagesController } from './pages.controller.js';
import { PagesRepository } from './pages.repository.js';
import { PagesService } from './pages.service.js';

/**
 * Pages and their drafts. Exports page access, persistence and evaluation (status + checks) to
 * publishing, preview and public delivery, which build on pages.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: PAGE_MODEL, schema: pageSchema }]),
    ActivityModule,
    AssetsModule,
    AuthModule,
    LeadsCoreModule,
    PrivacyCoreModule,
    PublishingCoreModule,
    SitesCoreModule,
  ],
  controllers: [PagesController],
  providers: [PagesRepository, PageAccessService, PageEvaluator, PagesService],
  exports: [PagesRepository, PageAccessService, PageEvaluator],
})
export class PagesModule {}
