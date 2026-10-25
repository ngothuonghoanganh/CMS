import { Module } from '@nestjs/common';
import { RendererSignatureGuard } from '../../shared/renderer-channel/renderer-request.js';
import { ActivityModule } from '../activity/activity.module.js';
import { DataRequestsCoreModule } from '../data-requests/data-requests-core.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PagesModule } from '../pages/pages.module.js';
import { PublishingCoreModule } from '../publishing/publishing-core.module.js';
import { SitesCoreModule } from '../sites/sites-core.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { LeadAccessService } from './lead-access.service.js';
import { LeadExportService } from './lead-export.service.js';
import { LeadInboxService } from './lead-inbox.service.js';
import { LeadIntakeService } from './lead-intake.service.js';
import { LeadPersonService } from './lead-person.service.js';
import { LeadsCoreModule } from './leads-core.module.js';
import { LeadsController } from './leads.controller.js';
import { PublicLeadsController } from './public-leads.controller.js';

/** Lead intake from public pages (ADR-016) and the lead inbox of the admin (ADR-018). */
@Module({
  imports: [
    ActivityModule,
    DataRequestsCoreModule,
    LeadsCoreModule,
    NotificationsModule,
    PagesModule,
    PublishingCoreModule,
    SitesCoreModule,
    WorkspacesModule,
  ],
  controllers: [PublicLeadsController, LeadsController],
  providers: [
    LeadAccessService,
    LeadExportService,
    LeadInboxService,
    LeadIntakeService,
    LeadPersonService,
    RendererSignatureGuard,
  ],
  // Data requests (ADR-017) reuse the access checks, a person's export and their deletion.
  exports: [LeadAccessService, LeadExportService, LeadPersonService],
})
export class LeadsModule {}
