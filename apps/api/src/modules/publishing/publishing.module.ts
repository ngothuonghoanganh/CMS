import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { EmailModule } from '../notifications/email.module.js';
import { PagesModule } from '../pages/pages.module.js';
import { PrivacyCoreModule } from '../privacy/privacy-core.module.js';
import { RevalidationModule } from '../revalidation/revalidation.module.js';
import { SitesCoreModule } from '../sites/sites-core.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { ApprovalNotifier } from './approval-notifier.service.js';
import { ApprovalsService } from './approvals.service.js';
import { PointerService } from './pointer.service.js';
import { PublishingCoreModule } from './publishing-core.module.js';
import { PublishingController } from './publishing.controller.js';
import { PublishingService } from './publishing.service.js';

/** Checks, publish, requests to publish, history, rollback, undo and unpublish (ADR-006, 023). */
@Module({
  imports: [
    ActivityModule,
    AuthModule,
    EmailModule,
    PagesModule,
    PrivacyCoreModule,
    PublishingCoreModule,
    RevalidationModule,
    SitesCoreModule,
    WorkspacesModule,
  ],
  controllers: [PublishingController],
  providers: [PointerService, PublishingService, ApprovalsService, ApprovalNotifier],
})
export class PublishingModule {}
