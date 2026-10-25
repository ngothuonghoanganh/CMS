import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { LeadsCoreModule } from '../leads/leads-core.module.js';
import { LeadsModule } from '../leads/leads.module.js';
import { PagesModule } from '../pages/pages.module.js';
import { SitesCoreModule } from '../sites/sites-core.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { DataRequestsCoreModule } from './data-requests-core.module.js';
import { DataRequestsController } from './data-requests.controller.js';
import { DataRequestsService } from './data-requests.service.js';

/** Requests from people who sent a form: to see, correct or delete their data (ADR-017). */
@Module({
  imports: [
    ActivityModule,
    DataRequestsCoreModule,
    AuthModule,
    LeadsCoreModule,
    LeadsModule,
    PagesModule,
    SitesCoreModule,
    WorkspacesModule,
  ],
  controllers: [DataRequestsController],
  providers: [DataRequestsService],
})
export class DataRequestsModule {}
