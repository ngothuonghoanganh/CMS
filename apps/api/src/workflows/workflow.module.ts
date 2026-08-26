import { Module } from '@nestjs/common';

import { SecurityModule } from '../security/security.module';
import { AuthenticationModule } from '../common/guards/authentication.module';
import { TenantModelsModule } from '../tenancy/tenant-models.module';
import { TenantModule } from '../tenancy/tenant.module';
import { ExtensionModule } from '../extensions/extension.module';
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
  ],
  exports: [WorkflowService, WorkflowExecutionService, WorkflowRegistryFacade],
})
export class WorkflowModule {}
