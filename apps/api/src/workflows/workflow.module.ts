import { Module } from '@nestjs/common';

import { SecurityModule } from '../security/security.module';
import { AuthenticationModule } from '../common/guards/authentication.module';
import { TenantModelsModule } from '../tenancy/tenant-models.module';
import { TenantModule } from '../tenancy/tenant.module';
import { ExtensionModule } from '../extensions/extension.module';
import { PAGE_PUBLISH_COMPATIBILITY } from '../shared/page-publish-compatibility';
import { CoreWorkflowContributions } from './core-workflow-contributions';
import {
  WorkflowActionRegistry,
  WorkflowConditionRegistry,
  WorkflowRegistryFacade,
  WorkflowTriggerRegistry,
} from './workflow-registry';
import {
  PageWorkflowController,
  WorkflowController,
  WorkflowExecutionController,
} from './workflow.controller';
import { WorkflowExecutionService } from './workflow-execution.service';
import { WorkflowService } from './workflow.service';
import {
  WORKFLOW_PAGE_PUBLISH_COMPATIBILITY_PROVIDER,
  WorkflowPagePublishCompatibilityAdapter,
} from './page-publish-compatibility.adapter';

@Module({
  imports: [
    AuthenticationModule,
    SecurityModule,
    TenantModelsModule,
    TenantModule,
    ExtensionModule,
  ],
  controllers: [WorkflowController, WorkflowExecutionController, PageWorkflowController],
  providers: [
    WorkflowTriggerRegistry,
    WorkflowConditionRegistry,
    WorkflowActionRegistry,
    WorkflowRegistryFacade,
    CoreWorkflowContributions,
    WorkflowService,
    WorkflowExecutionService,
    WorkflowPagePublishCompatibilityAdapter,
    WORKFLOW_PAGE_PUBLISH_COMPATIBILITY_PROVIDER,
  ],
  exports: [
    WorkflowService,
    WorkflowExecutionService,
    WorkflowRegistryFacade,
    PAGE_PUBLISH_COMPATIBILITY,
  ],
})
export class WorkflowModule {}
