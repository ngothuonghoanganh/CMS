import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import {
  CreateWorkflowRequestSchema,
  UpdateWorkflowRequestSchema,
  WorkflowDefinitionVersionSchema,
  WorkflowListQuerySchema,
  WorkflowListResponseSchema,
  WorkflowSchema,
  WorkflowVersionSchema,
  type CreateWorkflowRequest,
  type UpdateWorkflowRequest,
  type Workflow,
  type WorkflowDefinitionVersion,
  type WorkflowListResponse,
  type WorkflowRegistryResponse,
  type WorkflowVersion,
} from '@payload/contracts';

import {
  WorkflowRecord,
  WorkflowVersionRecord,
  type WorkflowDocument,
  type WorkflowVersionDocument,
} from '../persistence/schemas/workflow.schema';
import { PageRecord } from '../persistence/schemas/page.schema';
import { WorkspaceRecord } from '../persistence/schemas/workspace.schema';
import { ExtensionConnectionRecord } from '../persistence/schemas/extension-connection.schema';
import { TenantExtensionRecord } from '../persistence/schemas/tenant-extension.schema';
import {
  WorkflowRegistryFacade,
  WorkflowActionRegistry,
  WorkflowConditionRegistry,
  WorkflowTriggerRegistry,
} from './workflow-registry';
import { validateWorkflowGraph } from './workflow-graph';

@Injectable()
export class WorkflowService {
  constructor(
    @InjectModel(WorkflowRecord.name)
    private readonly workflowModel: Model<WorkflowRecord>,
    @InjectModel(WorkflowVersionRecord.name)
    private readonly versionModel: Model<WorkflowVersionRecord>,
    @InjectModel(PageRecord.name)
    private readonly pageModel: Model<PageRecord>,
    @InjectModel(WorkspaceRecord.name)
    private readonly workspaceModel: Model<WorkspaceRecord>,
    @InjectModel(ExtensionConnectionRecord.name)
    private readonly connectionModel: Model<ExtensionConnectionRecord>,
    @InjectModel(TenantExtensionRecord.name)
    private readonly extensionModel: Model<TenantExtensionRecord>,
    @Inject(WorkflowRegistryFacade) private readonly registry: WorkflowRegistryFacade,
    @Inject(WorkflowTriggerRegistry) private readonly triggers: WorkflowTriggerRegistry,
    @Inject(WorkflowConditionRegistry)
    private readonly conditions: WorkflowConditionRegistry,
    @Inject(WorkflowActionRegistry) private readonly actions: WorkflowActionRegistry,
  ) {}

  async create(input: CreateWorkflowRequest, workspaceId: string): Promise<Workflow> {
    const parsed = CreateWorkflowRequestSchema.parse(input);
    await this.validateScope(
      parsed.scope,
      parsed.pageId,
      parsed.workspaceId ?? workspaceId,
      workspaceId,
    );
    const definition = this.normalizeDefinition(parsed.definition);
    await this.validateDefinition(definition, workspaceId);
    const workflowId = randomUUID();
    const versionId = randomUUID();
    const workflow = await this.workflowModel.create({
      _id: workflowId,
      name: parsed.name,
      ...(parsed.description ? { description: parsed.description } : {}),
      scope: parsed.scope,
      ...(parsed.scope !== 'tenant'
        ? { workspaceId: parsed.workspaceId ?? workspaceId }
        : {}),
      ...(parsed.pageId ? { pageId: parsed.pageId } : {}),
      enabled: false,
      draftVersionId: versionId,
    });
    await this.versionModel.create({
      _id: versionId,
      workflowId,
      versionNumber: 1,
      status: 'draft',
      definition,
    });
    return this.toWorkflowContract(workflow);
  }

  async list(input: unknown, workspaceId: string): Promise<WorkflowListResponse> {
    const query = WorkflowListQuerySchema.parse(input);
    const filter: Record<string, unknown> = {
      $or: [{ workspaceId }, { scope: 'tenant' }],
    };
    if (query.scope) filter.scope = query.scope;
    if (query.pageId) filter.pageId = query.pageId;
    if (query.enabled !== undefined) filter.enabled = query.enabled;
    const [records, total] = await Promise.all([
      this.workflowModel
        .find(filter)
        .sort({ updatedAt: -1, _id: -1 })
        .skip(query.offset)
        .limit(query.limit)
        .exec(),
      this.workflowModel.countDocuments(filter).exec(),
    ]);
    return WorkflowListResponseSchema.parse({
      items: records.map((record) => this.toWorkflowContract(record)),
      pagination: {
        limit: query.limit,
        offset: query.offset,
        total,
        hasNextPage: query.offset + records.length < total,
      },
    });
  }

  async getById(workflowId: string, workspaceId: string): Promise<Workflow> {
    const record = await this.findWorkflow(workflowId, workspaceId);
    return this.toWorkflowContract(record);
  }

  async getVersion(
    workflowId: string,
    versionId: string,
    workspaceId: string,
  ): Promise<WorkflowVersion> {
    await this.findWorkflow(workflowId, workspaceId);
    const record = await this.versionModel.findOne({ _id: versionId, workflowId }).exec();
    if (!record) throw this.versionNotFound(versionId);
    return this.toVersionContract(record);
  }

  async update(
    workflowId: string,
    input: UpdateWorkflowRequest,
    workspaceId: string,
  ): Promise<Workflow> {
    const parsed = UpdateWorkflowRequestSchema.parse(input);
    const workflow = await this.findWorkflowDocument(workflowId, workspaceId);
    if (parsed.name !== undefined) workflow.name = parsed.name;
    if (parsed.description !== undefined) {
      workflow.set(
        'description',
        parsed.description === null ? undefined : parsed.description,
      );
    }
    if (parsed.definition) {
      const definition = WorkflowDefinitionVersionSchema.parse(parsed.definition);
      await this.validateDefinition(definition, workspaceId);
      const latest = await this.versionModel
        .findOne({ workflowId })
        .sort({ versionNumber: -1 })
        .exec();
      const version = await this.versionModel.create({
        _id: randomUUID(),
        workflowId,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        status: 'draft',
        definition,
      });
      workflow.draftVersionId = version._id.toString();
    }
    await workflow.save();
    return this.toWorkflowContract(workflow);
  }

  async publish(workflowId: string, workspaceId: string): Promise<Workflow> {
    const workflow = await this.findWorkflowDocument(workflowId, workspaceId);
    if (!workflow.draftVersionId) {
      throw new BadRequestException({
        code: 'WORKFLOW_DRAFT_MISSING',
        message: 'Workflow has no draft version',
      });
    }
    const version = await this.versionModel
      .findOne({ _id: workflow.draftVersionId, workflowId })
      .exec();
    if (!version) throw this.versionNotFound(workflow.draftVersionId);
    const definition = WorkflowDefinitionVersionSchema.parse(version.definition);
    await this.validateDefinition(definition, workspaceId);
    version.status = 'published';
    version.publishedAt = new Date();
    await version.save();
    workflow.publishedVersionId = version._id.toString();
    await workflow.save();
    return this.toWorkflowContract(workflow);
  }

  async setEnabled(
    workflowId: string,
    enabled: boolean,
    workspaceId: string,
  ): Promise<Workflow> {
    const workflow = await this.findWorkflowDocument(workflowId, workspaceId);
    if (enabled && !workflow.publishedVersionId) {
      throw new ConflictException({
        code: 'WORKFLOW_NOT_PUBLISHED',
        message: 'Publish a workflow version before enabling it',
      });
    }
    workflow.enabled = enabled;
    await workflow.save();
    return this.toWorkflowContract(workflow);
  }

  async validate(workflowId: string, workspaceId: string): Promise<{ valid: true }> {
    const workflow = await this.findWorkflowDocument(workflowId, workspaceId);
    const versionId = workflow.draftVersionId ?? workflow.publishedVersionId;
    if (!versionId)
      throw new BadRequestException({
        code: 'WORKFLOW_DRAFT_MISSING',
        message: 'Workflow has no version',
      });
    const version = await this.versionModel
      .findOne({ _id: versionId, workflowId })
      .exec();
    if (!version) throw this.versionNotFound(versionId);
    await this.validateDefinition(
      WorkflowDefinitionVersionSchema.parse(version.definition),
      workspaceId,
    );
    return { valid: true };
  }

  registryEntries(): WorkflowRegistryResponse {
    const available = this.registry.available();
    return {
      triggers: available.triggers.map(toRegistryEntry),
      conditions: available.conditions.map(toRegistryEntry),
      actions: available.actions.map(toRegistryEntry),
    };
  }

  async resolvePublished(
    workflowId: string,
    workspaceId: string,
  ): Promise<{
    workflow: WorkflowDocument;
    version: WorkflowVersionDocument;
    definition: WorkflowDefinitionVersion;
  }> {
    const workflow = await this.findWorkflowDocument(workflowId, workspaceId);
    if (!workflow.enabled || !workflow.publishedVersionId) {
      throw new ConflictException({
        code: 'WORKFLOW_DISABLED',
        message: 'Workflow is not enabled and published',
      });
    }
    const version = await this.versionModel
      .findOne({ _id: workflow.publishedVersionId, workflowId })
      .exec();
    if (!version) throw this.versionNotFound(workflow.publishedVersionId);
    return {
      workflow,
      version,
      definition: WorkflowDefinitionVersionSchema.parse(version.definition),
    };
  }

  async validatePagePublishDependencies(
    pageId: string,
    workspaceId: string,
  ): Promise<void> {
    const pageWorkflows = await this.workflowModel
      .find({ scope: 'page', pageId, workspaceId })
      .select('_id name publishedVersionId')
      .exec();
    const unpublished = pageWorkflows.filter((workflow) => !workflow.publishedVersionId);
    if (unpublished.length > 0) {
      throw new BadRequestException({
        code: 'PAGE_WORKFLOW_NOT_PUBLISHED',
        message:
          'Every workflow attached to a page must have a published version before the page can be published',
        details: {
          workflowIds: unpublished.map((workflow) => workflow._id.toString()),
          workflowNames: unpublished.map((workflow) => workflow.name),
        },
      });
    }
  }

  private async validateDefinition(
    definition: WorkflowDefinitionVersion,
    _workspaceId: string,
  ): Promise<void> {
    const graph = validateWorkflowGraph(definition);
    const issues = [...graph.issues];
    if (!this.triggers.has(definition.trigger.type)) {
      issues.push({
        code: 'TRIGGER_MISSING',
        message: `Trigger ${definition.trigger.type} is not registered`,
      });
    }
    this.registry.refreshContributions();
    for (const node of definition.nodes) {
      if (node.category === 'action' && !this.actions.has(node.type)) {
        issues.push({
          code: 'EDGE_INVALID',
          nodeId: node.id,
          message: `Action ${node.type} is not registered`,
        });
      }
      const action = node.category === 'action' ? this.actions.get(node.type) : undefined;
      const requiredCapability = action?.requiredCapability ?? action?.capability;
      if (requiredCapability && !this.registryAvailableCapability(requiredCapability)) {
        issues.push({
          code: 'UNSAFE_CONFIG',
          nodeId: node.id,
          message: `Capability ${requiredCapability} is unavailable`,
        });
      }
      if (node.category === 'condition' && !this.conditions.has(node.type)) {
        issues.push({
          code: 'EDGE_INVALID',
          nodeId: node.id,
          message: `Condition ${node.type} is not registered`,
        });
      }
      if (node.category === 'trigger' && !this.triggers.has(node.type)) {
        issues.push({
          code: 'TRIGGER_MISSING',
          nodeId: node.id,
          message: `Trigger ${node.type} is not registered`,
        });
      }
      const connectionIds = collectConnectionIds(node.config);
      for (const connectionId of connectionIds) {
        const connection = await this.connectionModel
          .findOne({ _id: connectionId })
          .exec();
        if (!connection) {
          issues.push({
            code: 'UNSAFE_CONFIG',
            nodeId: node.id,
            message: `Connection ${connectionId} was not found`,
          });
          continue;
        }
        if (connection.status === 'disabled') {
          issues.push({
            code: 'UNSAFE_CONFIG',
            nodeId: node.id,
            message: `Connection ${connectionId} is disabled`,
          });
        }
        if (
          node.config.extensionId &&
          connection.extensionId !== node.config.extensionId
        ) {
          issues.push({
            code: 'UNSAFE_CONFIG',
            nodeId: node.id,
            message: `Connection ${connectionId} belongs to another extension`,
          });
        }
      }
      if (node.config.extensionId && typeof node.config.extensionId === 'string') {
        const installation = await this.extensionModel
          .findOne({ extensionId: node.config.extensionId, enabled: true })
          .exec();
        if (!installation) {
          issues.push({
            code: 'UNSAFE_CONFIG',
            nodeId: node.id,
            message: `Extension ${node.config.extensionId} is not enabled`,
          });
        }
      }
    }
    if (issues.length > 0) {
      throw new BadRequestException({
        code: 'WORKFLOW_INVALID',
        message: 'The workflow graph is invalid',
        details: { issues },
      });
    }
  }

  private registryAvailableCapability(capability: string): boolean {
    try {
      this.registry.requireCapability(capability);
      return true;
    } catch {
      return false;
    }
  }

  private normalizeDefinition(
    input: WorkflowDefinitionVersion | undefined,
  ): WorkflowDefinitionVersion {
    return WorkflowDefinitionVersionSchema.parse(
      input ?? {
        trigger: { type: 'manual', config: {} },
        nodes: [{ id: 'trigger', type: 'manual', category: 'trigger', config: {} }],
        edges: [],
        retryPolicy: { maxAttempts: 3, initialDelayMs: 0, backoffMultiplier: 2 },
      },
    );
  }

  private async validateScope(
    scope: 'tenant' | 'workspace' | 'page',
    pageId: string | undefined,
    targetWorkspaceId: string,
    requestedWorkspaceId: string,
  ): Promise<void> {
    if (scope === 'page' && !pageId) {
      throw new BadRequestException({
        code: 'WORKFLOW_PAGE_REQUIRED',
        message: 'Page workflows require pageId',
      });
    }
    if (scope === 'tenant' && pageId) {
      throw new BadRequestException({
        code: 'WORKFLOW_PAGE_SCOPE_INVALID',
        message: 'Only page-scoped workflows may reference a page',
      });
    }
    if (scope !== 'tenant' && !targetWorkspaceId) {
      throw new BadRequestException({
        code: 'WORKFLOW_WORKSPACE_REQUIRED',
        message: 'Workspace workflows require workspaceId',
      });
    }
    if (scope !== 'tenant' && targetWorkspaceId !== requestedWorkspaceId) {
      throw new NotFoundException({
        code: 'WORKFLOW_WORKSPACE_NOT_FOUND',
        message: `Workspace ${targetWorkspaceId} is not available in the current context`,
      });
    }
    if (scope !== 'tenant') {
      const workspace = await this.workspaceModel
        .findOne({ _id: targetWorkspaceId })
        .exec();
      if (!workspace)
        throw this.notFound('WORKFLOW_WORKSPACE_NOT_FOUND', targetWorkspaceId);
    }
    if (pageId) {
      const page = await this.pageModel
        .findOne({ _id: pageId, workspaceId: targetWorkspaceId })
        .exec();
      if (!page) throw this.notFound('WORKFLOW_PAGE_NOT_FOUND', pageId);
    }
  }

  private async findWorkflowDocument(
    workflowId: string,
    workspaceId: string,
  ): Promise<WorkflowDocument> {
    const workflow = await this.workflowModel
      .findOne({ _id: workflowId, $or: [{ workspaceId }, { scope: 'tenant' }] })
      .exec();
    if (!workflow) throw this.notFound('WORKFLOW_NOT_FOUND', workflowId);
    return workflow;
  }
  private async findWorkflow(
    workflowId: string,
    workspaceId: string,
  ): Promise<WorkflowDocument> {
    return this.findWorkflowDocument(workflowId, workspaceId);
  }

  private toWorkflowContract(record: WorkflowRecord): Workflow {
    return WorkflowSchema.parse({
      id: record._id.toString(),
      name: record.name,
      ...(record.description ? { description: record.description } : {}),
      scope: record.scope,
      ...(record.pageId ? { pageId: record.pageId } : {}),
      ...(record.workspaceId ? { workspaceId: record.workspaceId } : {}),
      enabled: record.enabled,
      ...(record.draftVersionId ? { draftVersionId: record.draftVersionId } : {}),
      ...(record.publishedVersionId
        ? { publishedVersionId: record.publishedVersionId }
        : {}),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }
  private toVersionContract(record: WorkflowVersionRecord): WorkflowVersion {
    return WorkflowVersionSchema.parse({
      id: record._id.toString(),
      workflowId: record.workflowId,
      versionNumber: record.versionNumber,
      status: record.status,
      definition: record.definition,
      ...(record.createdBy ? { createdBy: record.createdBy } : {}),
      ...(record.publishedAt ? { publishedAt: record.publishedAt.toISOString() } : {}),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }
  private versionNotFound(versionId: string): NotFoundException {
    return this.notFound('WORKFLOW_VERSION_NOT_FOUND', versionId);
  }
  private notFound(code: string, id: string): NotFoundException {
    return new NotFoundException({ code, message: `${code}: ${id}` });
  }
}

function collectConnectionIds(value: unknown, result: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((item) => collectConnectionIds(item, result));
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key === 'connectionId' && typeof child === 'string') result.push(child);
      else collectConnectionIds(child, result);
    }
  }
  return result;
}

function toRegistryEntry(definition: {
  type: string;
  category: 'trigger' | 'condition' | 'action' | 'control';
  label: string;
  description?: string | undefined;
  capability?: string | undefined;
  extensionId?: string | undefined;
  configSchema?: unknown | undefined;
  outputSchema?: unknown | undefined;
}) {
  return {
    type: definition.type,
    category: definition.category,
    label: definition.label,
    ...(definition.description ? { description: definition.description } : {}),
    ...(definition.capability ? { capability: definition.capability } : {}),
    ...(definition.extensionId ? { extensionId: definition.extensionId } : {}),
    ...(definition.configSchema ? { configSchema: definition.configSchema } : {}),
    ...(definition.outputSchema ? { outputSchema: definition.outputSchema } : {}),
  };
}
