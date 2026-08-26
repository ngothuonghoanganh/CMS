import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CreateWorkflowRequestSchema,
  UpdateWorkflowRequestSchema,
  WorkflowExecutionListQuerySchema,
  WorkflowListQuerySchema,
  WorkflowRetryRequestSchema,
  type CreateWorkflowRequest,
  type UpdateWorkflowRequest,
} from '@payload/contracts';

import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import { AuthenticationGuard } from '../common/guards/authentication.guard';
import { requireWorkspaceId } from '../common/guards/workspace-context';
import type { PlatformRequest } from '../common/interfaces/request';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuditService } from '../security/audit.service';
import { AuthorizationService } from '../security/authorization.service';
import { WorkflowExecutionService } from './workflow-execution.service';
import { WorkflowService } from './workflow.service';

@Controller('workflows')
@UseGuards(AuthenticationGuard)
export class WorkflowController {
  constructor(
    @Inject(WorkflowService) private readonly workflows: WorkflowService,
    @Inject(WorkflowExecutionService)
    private readonly executions: WorkflowExecutionService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get('registry')
  async registry(@CurrentPrincipal() principal: PlatformRequest['auth']) {
    await this.authorization.assertCan(principal, 'workflow.read');
    return this.workflows.registryEntries();
  }

  @Get()
  async list(
    @Query(new ZodValidationPipe(WorkflowListQuerySchema)) query: unknown,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'workflow.read');
    return this.workflows.list(query, requireWorkspaceId(principal));
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(CreateWorkflowRequestSchema))
    input: CreateWorkflowRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'workflow.create');
    const result = await this.workflows.create(input, requireWorkspaceId(principal));
    await this.recordAudit(principal, 'workflow.created', result.id, {
      scope: result.scope,
    });
    return result;
  }

  @Get(':workflowId')
  async get(
    @Param('workflowId') workflowId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'workflow.read');
    return this.workflows.getById(workflowId, requireWorkspaceId(principal));
  }

  @Get(':workflowId/versions/:versionId')
  async version(
    @Param('workflowId') workflowId: string,
    @Param('versionId') versionId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'workflow.read');
    return this.workflows.getVersion(
      workflowId,
      versionId,
      requireWorkspaceId(principal),
    );
  }

  @Patch(':workflowId')
  async update(
    @Param('workflowId') workflowId: string,
    @Body(new ZodValidationPipe(UpdateWorkflowRequestSchema))
    input: UpdateWorkflowRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'workflow.update');
    const result = await this.workflows.update(
      workflowId,
      input,
      requireWorkspaceId(principal),
    );
    await this.recordAudit(principal, 'workflow.updated', result.id, {
      changedFields: Object.keys(input),
    });
    return result;
  }

  @Post(':workflowId/validate')
  async validate(
    @Param('workflowId') workflowId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'workflow.update');
    return this.workflows.validate(workflowId, requireWorkspaceId(principal));
  }

  @Post(':workflowId/publish')
  async publish(
    @Param('workflowId') workflowId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'workflow.publish');
    const result = await this.workflows.publish(
      workflowId,
      requireWorkspaceId(principal),
    );
    await this.recordAudit(principal, 'workflow.published', result.id, {
      publishedVersionId: result.publishedVersionId,
    });
    return result;
  }

  @Post(':workflowId/enable')
  async enable(
    @Param('workflowId') workflowId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'workflow.enable');
    const result = await this.workflows.setEnabled(
      workflowId,
      true,
      requireWorkspaceId(principal),
    );
    await this.recordAudit(principal, 'workflow.enabled', result.id, {});
    return result;
  }

  @Post(':workflowId/disable')
  async disable(
    @Param('workflowId') workflowId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'workflow.disable');
    const result = await this.workflows.setEnabled(
      workflowId,
      false,
      requireWorkspaceId(principal),
    );
    await this.recordAudit(principal, 'workflow.disabled', result.id, {});
    return result;
  }

  @Post(':workflowId/run')
  async run(
    @Param('workflowId') workflowId: string,
    @Body() payload: Record<string, unknown>,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'workflow.update');
    return this.executions.createManual(
      workflowId,
      requireWorkspaceId(principal),
      payload ?? {},
    );
  }

  private async recordAudit(
    principal: PlatformRequest['auth'],
    action: string,
    resourceId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action,
        resourceType: 'workflow',
        resourceId,
        ...(principal?.workspaceId ? { workspaceId: principal.workspaceId } : {}),
        result: 'success',
        metadata,
      })
      .catch(() => undefined);
  }
}

@Controller('workflow-executions')
@UseGuards(AuthenticationGuard)
export class WorkflowExecutionController {
  constructor(
    @Inject(WorkflowExecutionService)
    private readonly executions: WorkflowExecutionService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(WorkflowExecutionListQuerySchema)) query: unknown,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'workflow.execution.read');
    return this.executions.list(query, requireWorkspaceId(principal));
  }

  @Get(':executionId')
  async get(
    @Param('executionId') executionId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'workflow.execution.read');
    return this.executions.getById(executionId, requireWorkspaceId(principal));
  }

  @Post(':executionId/retry')
  async retry(
    @Param('executionId') executionId: string,
    @Body(new ZodValidationPipe(WorkflowRetryRequestSchema))
    _input: Record<string, never>,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'workflow.execution.retry');
    const result = await this.executions.retry(
      executionId,
      requireWorkspaceId(principal),
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'workflow.execution.retried',
        resourceType: 'workflow_execution',
        resourceId: executionId,
        ...(principal?.workspaceId ? { workspaceId: principal.workspaceId } : {}),
        result: 'success',
      })
      .catch(() => undefined);
    return result;
  }
}

@Controller('pages/:pageId/workflows')
@UseGuards(AuthenticationGuard)
export class PageWorkflowController {
  constructor(
    @Inject(WorkflowService) private readonly workflows: WorkflowService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get()
  async list(
    @Param('pageId') pageId: string,
    @Query() query: Record<string, unknown>,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'workflow.read');
    return this.workflows.list({ ...query, pageId }, requireWorkspaceId(principal));
  }

  @Post()
  async create(
    @Param('pageId') pageId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'workflow.create');
    const parsed = CreateWorkflowRequestSchema.parse({
      ...(body && typeof body === 'object' ? body : {}),
      scope: 'page',
      pageId,
    });
    const result = await this.workflows.create(parsed, requireWorkspaceId(principal));
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'workflow.created',
        resourceType: 'workflow',
        resourceId: result.id,
        ...(principal?.workspaceId ? { workspaceId: principal.workspaceId } : {}),
        result: 'success',
        metadata: { scope: result.scope, pageId },
      })
      .catch(() => undefined);
    return result;
  }
}
