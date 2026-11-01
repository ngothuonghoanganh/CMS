import { DomainsCoreModule } from '../domains/domains-core.module.js';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RendererSignatureGuard } from '../../shared/renderer-channel/renderer-request.js';
import { LeadsCoreModule } from '../leads/leads-core.module.js';
import { PagesModule } from '../pages/pages.module.js';
import { SitesCoreModule } from '../sites/sites-core.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { AnalyticsController } from './analytics.controller.js';
import { AnalyticsReportService } from './analytics-report.service.js';
import { AnalyticsRepository } from './analytics.repository.js';
import {
  ANALYTICS_DAILY_COLLECTION,
  ANALYTICS_SALT_MODEL,
  ANALYTICS_SEEN_COLLECTION,
  analyticsSaltSchema,
} from './analytics.schema.js';
import { SourceCapRegistry } from './domain/source-cap.js';
import { PageViewCollector } from './page-view-collector.service.js';
import { PublicEventsController } from './public-events.controller.js';
import { WorkspaceCollectionsModule } from '../../shared/persistence/workspace-databases.js';

/** Page views without cookies and the "Hiệu quả" report (ADR-019). */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: ANALYTICS_SALT_MODEL, schema: analyticsSaltSchema }]),
    WorkspaceCollectionsModule.forFeature([ANALYTICS_SEEN_COLLECTION, ANALYTICS_DAILY_COLLECTION]),
    DomainsCoreModule,
    LeadsCoreModule,
    PagesModule,
    SitesCoreModule,
    WorkspacesModule,
  ],
  controllers: [PublicEventsController, AnalyticsController],
  providers: [
    AnalyticsRepository,
    AnalyticsReportService,
    PageViewCollector,
    RendererSignatureGuard,
    // In memory, shared by every view this instance counts.
    SourceCapRegistry,
  ],
})
export class AnalyticsModule {}
