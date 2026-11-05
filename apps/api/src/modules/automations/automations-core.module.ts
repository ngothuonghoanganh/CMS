import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorkspaceCollectionsModule } from '../../shared/persistence/workspace-databases.js';
import {
  AUTOMATION_COLLECTION,
  AUTOMATION_RUN_COLLECTION,
  AUTOMATION_USAGE_COLLECTION,
} from './automation.schema.js';
import { AutomationRunsRepository } from './automation-runs.repository.js';
import { AutomationTriggers } from './automation-triggers.service.js';
import { AutomationUsageRepository } from './automation-usage.repository.js';
import { AutomationsRepository } from './automations.repository.js';
import { JOB_WAKEUP_MODEL, jobWakeupSchema } from './job-wakeup.schema.js';
import { JobWakeupsRepository } from './job-wakeups.repository.js';

/**
 * Automations and their queue without HTTP (ADR-034): the events of leads, opportunities and tasks
 * create runs through `AutomationTriggers`.
 */
@Module({
  imports: [
    WorkspaceCollectionsModule.forFeature([
      AUTOMATION_COLLECTION,
      AUTOMATION_RUN_COLLECTION,
      AUTOMATION_USAGE_COLLECTION,
    ]),
    MongooseModule.forFeature([{ name: JOB_WAKEUP_MODEL, schema: jobWakeupSchema }]),
  ],
  providers: [
    AutomationsRepository,
    AutomationRunsRepository,
    AutomationUsageRepository,
    JobWakeupsRepository,
    AutomationTriggers,
  ],
  exports: [
    AutomationsRepository,
    AutomationRunsRepository,
    AutomationUsageRepository,
    JobWakeupsRepository,
    AutomationTriggers,
  ],
})
export class AutomationsCoreModule {}
