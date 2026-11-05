import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AutomationsCoreModule } from '../automations/automations-core.module.js';
import { DataRequestsCoreModule } from '../data-requests/data-requests-core.module.js';
import { DataRequestsModule } from '../data-requests/data-requests.module.js';
import { LeadsCoreModule } from '../leads/leads-core.module.js';
import { LeadsModule } from '../leads/leads.module.js';
import { PagesModule } from '../pages/pages.module.js';
import { PublishingCoreModule } from '../publishing/publishing-core.module.js';
import { SitesCoreModule } from '../sites/sites-core.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { ContactAssignees } from './contact-assignees.service.js';
import { ContactProfileController } from './contact-profile.controller.js';
import { ContactProfileService } from './contact-profile.service.js';
import { ContactsBackfill } from './contacts-backfill.service.js';
import { ContactsCoreModule } from './contacts-core.module.js';
import { ContactsController } from './contacts.controller.js';
import { ContactsService } from './contacts.service.js';
import { PipelineController } from './pipeline.controller.js';
import { PipelineService } from './pipeline.service.js';

/**
 * The customers screen, profiles and the pipeline (boards 22–24, ADR-033), and the backfill of leads stored
 * before them.
 */
@Module({
  imports: [
    AuthModule,
    AutomationsCoreModule,
    ContactsCoreModule,
    DataRequestsCoreModule,
    DataRequestsModule,
    LeadsCoreModule,
    LeadsModule,
    PagesModule,
    PublishingCoreModule,
    SitesCoreModule,
    WorkspacesModule,
  ],
  // The list's fixed routes (`contacts/options`, `contacts/search`) before `contacts/:contactId`.
  controllers: [ContactsController, ContactProfileController, PipelineController],
  providers: [
    ContactsService,
    ContactProfileService,
    PipelineService,
    ContactAssignees,
    ContactsBackfill,
  ],
  // An automation's steps give profiles and tasks to the same members (ADR-034).
  exports: [ContactsBackfill, ContactAssignees],
})
export class ContactsModule {}
