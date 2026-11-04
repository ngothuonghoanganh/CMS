import { Module } from '@nestjs/common';
import type { Env } from '../../config/env.js';
import { ENV } from '../../shared/env.js';
import { WorkspaceCollectionsModule } from '../../shared/persistence/workspace-databases.js';
import { AuthModule } from '../auth/auth.module.js';
import { LeadsCoreModule } from '../leads/leads-core.module.js';
import { PagesModule } from '../pages/pages.module.js';
import { SitesCoreModule } from '../sites/sites-core.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { createAiTextModel } from './adapters/create-ai-text-model.js';
import { AI_JOB_COLLECTION } from './ai-job.schema.js';
import { AiJobLedger } from './ai-job-ledger.js';
import { AiJobRunner } from './ai-job-runner.js';
import { AiJobsRepository } from './ai-jobs.repository.js';
import { AiPageJobsService } from './ai-page-jobs.service.js';
import { AiClock, AiQuota } from './ai-quota.service.js';
import { AiTextModel } from './ai-text-model.js';
import { AI_USAGE_COLLECTION } from './ai-usage.schema.js';
import { AiUsageRepository } from './ai-usage.repository.js';
import { AiController } from './ai.controller.js';
import { AiSuggestionsController } from './ai-suggestions.controller.js';
import { AiSuggestionsService } from './ai-suggestions.service.js';
import { MotionChooser } from './motion-chooser.service.js';
import { SectionWriter } from './section-writer.service.js';

/**
 * AI (ADR-031): the `AiTextModel` port with the adapter `AI_PROVIDER` names, the monthly quota,
 * creating a page from a brief, and the assistant of the editor. Exports the port, the section
 * writer and the quota.
 */
@Module({
  imports: [
    WorkspaceCollectionsModule.forFeature([AI_JOB_COLLECTION, AI_USAGE_COLLECTION]),
    AuthModule,
    // The per-user request limit counts in the master's shared counters.
    LeadsCoreModule,
    PagesModule,
    SitesCoreModule,
    WorkspacesModule,
  ],
  controllers: [AiController, AiSuggestionsController],
  providers: [
    { provide: AiTextModel, inject: [ENV], useFactory: (env: Env) => createAiTextModel(env) },
    AiClock,
    AiQuota,
    AiUsageRepository,
    AiJobsRepository,
    AiJobLedger,
    SectionWriter,
    MotionChooser,
    AiJobRunner,
    AiPageJobsService,
    AiSuggestionsService,
  ],
  exports: [AiTextModel, SectionWriter, AiQuota],
})
export class AiModule {}
