import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ActivityModule } from '../activity/activity.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { LeadsCoreModule } from '../leads/leads-core.module.js';
import { LeadsModule } from '../leads/leads.module.js';
import { PagesModule } from '../pages/pages.module.js';
import { SitesCoreModule } from '../sites/sites-core.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { DATA_REQUEST_MODEL, dataRequestSchema } from './data-request.schema.js';
import { DataRequestsController } from './data-requests.controller.js';
import { DataRequestsRepository } from './data-requests.repository.js';
import { DataRequestsService } from './data-requests.service.js';

/** Requests from people who sent a form: to see, correct or delete their data (ADR-017). */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: DATA_REQUEST_MODEL, schema: dataRequestSchema }]),
    ActivityModule,
    AuthModule,
    LeadsCoreModule,
    LeadsModule,
    PagesModule,
    SitesCoreModule,
    WorkspacesModule,
  ],
  controllers: [DataRequestsController],
  providers: [DataRequestsRepository, DataRequestsService],
})
export class DataRequestsModule {}
