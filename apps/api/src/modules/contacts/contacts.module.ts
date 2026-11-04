import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { LeadsCoreModule } from '../leads/leads-core.module.js';
import { PagesModule } from '../pages/pages.module.js';
import { SitesCoreModule } from '../sites/sites-core.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { ContactsBackfill } from './contacts-backfill.service.js';
import { ContactsCoreModule } from './contacts-core.module.js';
import { ContactsController } from './contacts.controller.js';
import { ContactsService } from './contacts.service.js';

/** The customers screen (board 22, ADR-033) and the backfill of leads stored before it. */
@Module({
  imports: [
    AuthModule,
    ContactsCoreModule,
    LeadsCoreModule,
    PagesModule,
    SitesCoreModule,
    WorkspacesModule,
  ],
  controllers: [ContactsController],
  providers: [ContactsService, ContactsBackfill],
  exports: [ContactsBackfill],
})
export class ContactsModule {}
