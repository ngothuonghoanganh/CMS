import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PagesModule } from '../pages/pages.module.js';
import { PrivacyCoreModule } from '../privacy/privacy-core.module.js';
import { RevalidationModule } from '../revalidation/revalidation.module.js';
import { SitesCoreModule } from '../sites/sites-core.module.js';
import { PointerService } from './pointer.service.js';
import { PublishingCoreModule } from './publishing-core.module.js';
import { PublishingController } from './publishing.controller.js';
import { PublishingService } from './publishing.service.js';

/** Checks, publish, history, rollback, undo and unpublish endpoints (ADR-006). */
@Module({
  imports: [
    ActivityModule,
    AuthModule,
    PagesModule,
    PrivacyCoreModule,
    PublishingCoreModule,
    RevalidationModule,
    SitesCoreModule,
  ],
  controllers: [PublishingController],
  providers: [PointerService, PublishingService],
})
export class PublishingModule {}
