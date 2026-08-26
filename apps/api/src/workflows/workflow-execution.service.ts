import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import {
  SanitizedExecutionErrorSchema,
  WorkflowDefinitionVersionSchema,
  WorkflowExecutionListQuerySchema,
  WorkflowExecutionListResponseSchema,
  WorkflowExecutionSchema,
  WorkflowStepExecutionSchema,
  type WorkflowDefinitionVersion,
  type WorkflowExecution,
  type WorkflowExecutionListResponse,
  type WorkflowExpression,
  type WorkflowNode,
  type WorkflowStepExecution,
} from '@payload/contracts';

import { EventBus } from '../extensions/event-bus';
import { CapabilityRegistry } from '../extensions/capability-registry';
import { TenantContext } from '../tenancy/tenant-context';
import { ExtensionConnectionRecord } from '../persistence/schemas/extension-connection.schema';
import { IntegrationSecretVault } from '../domain/integration-secret-vault';
import { env } from '../config/env';
import { platformLogger } from '../common/logging/platform-logger';
import {
  WorkflowExecutionRecord,
  WorkflowRecord,
  WorkflowStepExecutionRecord,
  WorkflowVersionRecord,
  type WorkflowExecutionDocument,
  type WorkflowStepExecutionDocument,
  type WorkflowVersionDocument,
} from '../persistence/schemas/workflow.schema';
import { WorkflowActionFailure } from './core-workflow-contributions';
import { evaluateWorkflowExpression, resolveWorkflowValue } from './workflow-condition';
import { WorkflowActionRegistry, WorkflowTriggerRegistry } from './workflow-registry';
import type {
  WorkflowActionResult,
  WorkflowExecutionContext,
} from './workflow-runtime-types';

const eventNames = [
  'form.submitted',
  'page.viewed',
  'button.clicked',
  'page.published',
  'lead.created',
  'payment.completed',
  'payment.failed',
  'order.created',
  'order.completed',
  'booking.created',
  'cart.abandoned',
] as const;

@Injectable()
export class WorkflowExecutionService implements OnModuleInit, OnModuleDestroy {
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly unsubscribers: Array<() => void> = [];
  private processing = new Set<string>();

  constructor(
    @InjectModel(WorkflowRecord.name)
    private readonly workflowModel: Model<WorkflowRecord>,
    @InjectModel(WorkflowVersionRecord.name)
    private readonly versionModel: Model<WorkflowVersionRecord>,
    @InjectModel(WorkflowExecutionRecord.name)
    private readonly executionModel: Model<WorkflowExecutionRecord>,
    @InjectModel(WorkflowStepExecutionRecord.name)
    private readonly stepModel: Model<WorkflowStepExecutionRecord>,
    @InjectModel(ExtensionConnectionRecord.name)
    private readonly connectionModel: Model<ExtensionConnectionRecord>,
    @Inject(EventBus) private readonly events: EventBus,
    @Inject(TenantContext) private readonly tenantContext: TenantContext,
    @Inject(CapabilityRegistry) private readonly capabilities: CapabilityRegistry,
    @Inject(WorkflowTriggerRegistry) private readonly triggers: WorkflowTriggerRegistry,
    @Inject(WorkflowActionRegistry) private readonly actions: WorkflowActionRegistry,
  ) {}

  onModuleInit(): void {
    for (const eventName of eventNames) {
      const unsubscribe = this.events.subscribe(eventName, (event) =>
        this.handleEvent(eventName, event as unknown as Record<string, unknown>),
      );
      this.unsubscribers.push(unsubscribe);
    }
  }

  onModuleDestroy(): void {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers.length = 0;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  async handleEvent(eventName: string, event: Record<string, unknown>): Promise<void> {
    const tenantId =
      typeof event.tenantId === 'string' ? event.tenantId : this.tenantContext.get()?.id;
    if (!tenantId) return;
    const workspaceId =
      typeof event.workspaceId === 'string' ? event.workspaceId : undefined;
    const pageId = typeof event.pageId === 'string' ? event.pageId : undefined;
    const records = await this.workflowModel
      .find({
        enabled: true,
        publishedVersionId: { $exists: true },
        $or: [
          { scope: 'tenant' },
          ...(workspaceId ? [{ scope: 'workspace', workspaceId }] : []),
          ...(pageId ? [{ scope: 'page', pageId }] : []),
        ],
      })
      .exec();

    await Promise.all(
      records.map(async (workflow) => {
        if (workflow.scope === 'page' && workflow.pageId !== pageId) return;
        if (workflow.scope === 'workspace' && workflow.workspaceId !== workspaceId)
          return;
        if (!workflow.publishedVersionId) return;
        const version = await this.versionModel
          .findOne({ _id: workflow.publishedVersionId, workflowId: workflow._id })
          .exec();
        if (!version) return;
        const definition = WorkflowDefinitionVersionSchema.safeParse(version.definition);
        if (!definition.success) return;
        const trigger = this.triggers.get(definition.data.trigger.type);
        if (!trigger) return;
        if (trigger.eventType && trigger.eventType !== eventName) return;
        if (!trigger.eventType && definition.data.trigger.type !== eventName) return;
        await this.createExecution(
          workflow,
          version,
          event,
          tenantId,
          definition.data.trigger.type,
        );
      }),
    );
  }

  async createManual(
    workflowId: string,
    workspaceId: string,
    payload: Record<string, unknown> = {},
  ): Promise<WorkflowExecution> {
    const workflow = await this.workflowModel
      .findOne({ _id: workflowId, $or: [{ workspaceId }, { scope: 'tenant' }] })
      .exec();
    if (!workflow) throw this.notFound('WORKFLOW_NOT_FOUND', workflowId);
    if (!workflow.enabled || !workflow.publishedVersionId) {
      throw new ConflictException({
        code: 'WORKFLOW_DISABLED',
        message: 'Workflow is not enabled and published',
      });
    }
    const version = await this.versionModel
      .findOne({ _id: workflow.publishedVersionId, workflowId })
      .exec();
    if (!version)
      throw this.notFound('WORKFLOW_VERSION_NOT_FOUND', workflow.publishedVersionId);
    const definition = WorkflowDefinitionVersionSchema.parse(version.definition);
    if (definition.trigger.type !== 'manual') {
      throw new BadRequestException({
        code: 'WORKFLOW_MANUAL_TRIGGER_REQUIRED',
        message: 'Workflow trigger is not manual',
      });
    }
    const execution = await this.insertExecution(workflow, version, {
      ...payload,
      tenantId: this.tenantContext.get()?.id,
      triggerType: 'manual',
      eventId: `manual:${randomUUID()}`,
    });
    void this.runExecution(execution._id.toString());
    return this.toExecutionContract(execution);
  }

  async list(
    input: unknown,
    workspaceId: string,
  ): Promise<WorkflowExecutionListResponse> {
    const query = WorkflowExecutionListQuerySchema.parse(input);
    const filter: Record<string, unknown> = {
      $or: [{ workspaceId }, { workspaceId: { $exists: false } }],
    };
    if (query.workflowId) filter.workflowId = query.workflowId;
    if (query.status) filter.status = query.status;
    const [records, total] = await Promise.all([
      this.executionModel
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(query.offset)
        .limit(query.limit)
        .exec(),
      this.executionModel.countDocuments(filter).exec(),
    ]);
    return WorkflowExecutionListResponseSchema.parse({
      items: records.map((record) => this.toExecutionContract(record)),
      pagination: {
        limit: query.limit,
        offset: query.offset,
        total,
        hasNextPage: query.offset + records.length < total,
      },
    });
  }

  async getById(
    executionId: string,
    workspaceId: string,
  ): Promise<{ execution: WorkflowExecution; steps: WorkflowStepExecution[] }> {
    const execution = await this.executionModel
      .findOne({
        _id: executionId,
        $or: [{ workspaceId }, { workspaceId: { $exists: false } }],
      })
      .exec();
    if (!execution) throw this.notFound('WORKFLOW_EXECUTION_NOT_FOUND', executionId);
    const steps = await this.stepModel
      .find({ executionId })
      .sort({ createdAt: 1, _id: 1 })
      .exec();
    return {
      execution: this.toExecutionContract(execution),
      steps: steps.map((step) => this.toStepContract(step)),
    };
  }

  async retry(executionId: string, workspaceId: string): Promise<WorkflowExecution> {
    const execution = await this.executionModel
      .findOne({
        _id: executionId,
        $or: [{ workspaceId }, { workspaceId: { $exists: false } }],
      })
      .exec();
    if (!execution) throw this.notFound('WORKFLOW_EXECUTION_NOT_FOUND', executionId);
    if (execution.status !== 'failed') {
      throw new ConflictException({
        code: 'WORKFLOW_EXECUTION_NOT_FAILED',
        message: 'Only failed executions can be retried',
      });
    }
    await this.stepModel
      .updateMany(
        { executionId, status: 'failed' },
        { $set: { status: 'pending', attempt: 0 }, $unset: { error: 1, completedAt: 1 } },
      )
      .exec();
    execution.status = 'pending';
    execution.set('error', undefined);
    execution.nextRunAt = new Date();
    await execution.save();
    void this.runExecution(execution._id.toString());
    return this.toExecutionContract(execution);
  }

  async processDue(): Promise<void> {
    const now = new Date();
    const records = await this.executionModel
      .find({ status: { $in: ['pending', 'waiting'] }, nextRunAt: { $lte: now } })
      .limit(50)
      .exec();
    await Promise.all(records.map((record) => this.runExecution(record._id.toString())));
  }

  async runExecution(executionId: string): Promise<void> {
    if (this.processing.has(executionId)) return;
    this.processing.add(executionId);
    try {
      const execution = await this.executionModel.findById(executionId).exec();
      if (!execution || ['completed', 'cancelled'].includes(execution.status)) return;
      const version = await this.versionModel
        .findOne({ _id: execution.workflowVersionId, workflowId: execution.workflowId })
        .exec();
      if (!version) {
        await this.failExecution(execution, {
          code: 'WORKFLOW_VERSION_MISSING',
          message: 'Workflow version is unavailable',
          retryable: false,
        });
        return;
      }
      const definition = WorkflowDefinitionVersionSchema.parse(version.definition);
      execution.status = 'running';
      execution.startedAt ??= new Date();
      execution.set('nextRunAt', undefined);
      await execution.save();
      const steps = await this.stepModel.find({ executionId }).exec();
      const stepByNode = new Map(steps.map((step) => [step.nodeId, step]));
      const outputs: Record<string, unknown> = Object.fromEntries(
        steps
          .filter((step) => step.status === 'success')
          .map((step) => [step.nodeId, step.output]),
      );
      const context = this.contextFor(execution, outputs);
      const nodes = new Map(definition.nodes.map((node) => [node.id, node]));
      const incoming = new Map<string, string[]>();
      const outgoing = new Map<string, typeof definition.edges>();
      for (const edge of definition.edges) {
        outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
        incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source]);
      }
      const resolved = new Set<string>();
      const arrivals = new Map<string, number>();
      const active = new Set<string>();
      let paused = false;

      const visit = async (nodeId: string): Promise<void> => {
        if (paused || resolved.has(nodeId)) return;
        const node = nodes.get(nodeId);
        if (!node) return;
        const predecessors = incoming.get(nodeId) ?? [];
        if (
          predecessors.length > 0 &&
          !predecessors.every((predecessor) => resolved.has(predecessor))
        )
          return;
        if (predecessors.length > 0 && (arrivals.get(nodeId) ?? 0) === 0) {
          resolved.add(nodeId);
          await this.markSkipped(executionId, node);
          return;
        }
        active.add(nodeId);
        const result = await this.executeNode(
          execution,
          definition,
          node,
          stepByNode,
          context,
        );
        if (result.waiting) {
          paused = true;
          return;
        }
        resolved.add(nodeId);
        outputs[nodeId] = result.output;
        context.steps[nodeId] = result.output;
        const nextEdges = selectEdges(outgoing.get(nodeId) ?? [], result.branchResult);
        for (const edge of nextEdges) {
          arrivals.set(edge.target, (arrivals.get(edge.target) ?? 0) + 1);
        }
        for (const edge of nextEdges) await visit(edge.target);
        active.delete(nodeId);
      };

      const roots = definition.nodes.filter(
        (node) => (incoming.get(node.id) ?? []).length === 0,
      );
      for (const root of roots) await visit(root.id);
      if (paused) return;
      for (const node of definition.nodes) {
        if (!resolved.has(node.id) && !active.has(node.id))
          await this.markSkipped(executionId, node);
      }
      execution.status = 'completed';
      execution.completedAt = new Date();
      execution.set('error', undefined);
      await execution.save();
    } catch (error) {
      const execution = await this.executionModel.findById(executionId).exec();
      if (!execution) return;
      const retryable = error instanceof WorkflowActionFailure ? error.retryable : false;
      const normalized = {
        code:
          error instanceof WorkflowActionFailure
            ? error.code
            : 'WORKFLOW_EXECUTION_FAILED',
        message: sanitizeMessage(
          error instanceof Error ? error.message : 'Workflow execution failed',
        ),
        retryable,
      };
      if (retryable) {
        const version = await this.versionModel
          .findById(execution.workflowVersionId)
          .exec();
        const definition = version
          ? WorkflowDefinitionVersionSchema.parse(version.definition)
          : undefined;
        const currentAttempt = await this.currentAttempt(executionId);
        if (definition && currentAttempt < definition.retryPolicy.maxAttempts) {
          execution.status = 'pending';
          execution.nextRunAt = new Date(
            Date.now() + retryDelay(definition, currentAttempt),
          );
          execution.error = SanitizedExecutionErrorSchema.parse(normalized);
          await execution.save();
          this.schedule(executionId, execution.nextRunAt.getTime() - Date.now());
          return;
        }
      }
      await this.failExecution(execution, normalized);
    } finally {
      this.processing.delete(executionId);
    }
  }

  private async executeNode(
    execution: WorkflowExecutionDocument,
    definition: WorkflowDefinitionVersion,
    node: WorkflowNode,
    stepByNode: Map<string, WorkflowStepExecutionDocument>,
    context: WorkflowExecutionContext,
  ): Promise<{
    output: unknown;
    branchResult?: boolean | undefined;
    waiting?: boolean | undefined;
  }> {
    const existing = stepByNode.get(node.id);
    if (existing?.status === 'success') {
      const output = existing.output;
      return {
        output,
        ...(readBranchResult(output) === undefined
          ? {}
          : { branchResult: readBranchResult(output) }),
      };
    }
    if (node.disabled) {
      await this.markSkipped(execution._id.toString(), node);
      return { output: { skipped: true } };
    }
    const step =
      existing ??
      (await this.stepModel.create({
        _id: randomUUID(),
        executionId: execution._id.toString(),
        nodeId: node.id,
        status: 'pending',
        attempt: 0,
      }));
    step.status = 'running';
    step.attempt += 1;
    step.startedAt = new Date();
    step.set('error', undefined);
    await step.save();
    try {
      const input = resolveObject(node.config, workflowLookup(context));
      let result: WorkflowActionResult = { output: { executed: true } };
      let branchResult: boolean | undefined;
      if (node.category === 'condition' || node.type === 'branch') {
        const expression =
          (input.expression as WorkflowExpression | undefined) ??
          ({
            operator: node.type,
            left: input.left,
            right: input.right,
          } as WorkflowExpression);
        if (!expression) throw new Error('Condition expression is required');
        branchResult = evaluateWorkflowExpression(expression, workflowLookup(context));
        result = { output: { result: branchResult } };
      } else if (node.category === 'trigger') {
        result = { output: context.trigger };
      } else {
        const action = this.actions.get(node.type === 'delay' ? 'delay' : node.type);
        if (!action?.execute) throw new Error(`Action ${node.type} is unavailable`);
        result = await action.execute(context, input);
      }
      const output = sanitizeValue(result.output ?? {});
      step.status = 'success';
      step.output = output;
      step.completedAt = new Date();
      await step.save();
      if (result.waitUntil) {
        execution.status = 'waiting';
        execution.nextRunAt = result.waitUntil;
        await execution.save();
        this.schedule(execution._id.toString(), result.waitUntil.getTime() - Date.now());
        return { output, waiting: true };
      }
      return { output, ...(branchResult === undefined ? {} : { branchResult }) };
    } catch (error) {
      const failure =
        error instanceof WorkflowActionFailure
          ? { code: error.code, message: error.message, retryable: error.retryable }
          : {
              code: 'WORKFLOW_NODE_FAILED',
              message: sanitizeMessage(
                error instanceof Error ? error.message : 'Workflow node failed',
              ),
              retryable: false,
            };
      step.status = 'failed';
      step.error = SanitizedExecutionErrorSchema.parse(failure);
      step.completedAt = new Date();
      await step.save();
      throw error;
    }
  }

  private async createExecution(
    workflow: WorkflowRecord,
    version: WorkflowVersionDocument,
    event: Record<string, unknown>,
    tenantId: string,
    triggerType: string,
  ): Promise<WorkflowExecutionDocument | undefined> {
    const eventId =
      typeof event.eventId === 'string'
        ? event.eventId
        : `${workflow._id}:${randomUUID()}`;
    if (
      typeof event.rootExecutionId === 'string' &&
      Number(event.workflowDepth ?? 0) >= 3
    )
      return undefined;
    try {
      const execution = await this.insertExecution(workflow, version, {
        ...event,
        tenantId,
        eventId,
        triggerType,
      });
      void this.runExecution(execution._id.toString());
      return execution;
    } catch (error) {
      if (isDuplicateKey(error)) return undefined;
      throw error;
    }
  }

  private async insertExecution(
    workflow: WorkflowRecord,
    version: WorkflowVersionDocument,
    event: Record<string, unknown>,
  ): Promise<WorkflowExecutionDocument> {
    const triggerPayload = sanitizeValue(event) as Record<string, unknown>;
    return this.executionModel.create({
      _id: randomUUID(),
      workflowId: workflow._id.toString(),
      workflowVersionId: version._id.toString(),
      ...(workflow.workspaceId ? { workspaceId: workflow.workspaceId } : {}),
      ...(workflow.pageId ? { pageId: workflow.pageId } : {}),
      status: 'pending',
      triggerType: typeof event.triggerType === 'string' ? event.triggerType : 'event',
      ...(typeof event.eventId === 'string' ? { triggerEventId: event.eventId } : {}),
      triggerPayload,
      variables: {},
      ...(typeof event.correlationId === 'string'
        ? { correlationId: event.correlationId }
        : {}),
      ...(typeof event.rootExecutionId === 'string'
        ? { rootExecutionId: event.rootExecutionId }
        : {}),
    });
  }

  private contextFor(
    execution: WorkflowExecutionDocument,
    steps: Record<string, unknown>,
  ): WorkflowExecutionContext {
    const triggerTenantId =
      execution.triggerPayload && typeof execution.triggerPayload === 'object'
        ? (execution.triggerPayload as Record<string, unknown>).tenantId
        : undefined;
    return {
      tenantId:
        typeof triggerTenantId === 'string'
          ? triggerTenantId
          : (this.tenantContext.get()?.id ?? 'unknown'),
      workflowId: execution.workflowId,
      workflowVersionId: execution.workflowVersionId,
      executionId: execution._id.toString(),
      ...(execution.pageId ? { pageId: execution.pageId } : {}),
      ...(execution.workspaceId ? { workspaceId: execution.workspaceId } : {}),
      trigger: execution.triggerPayload,
      variables: execution.variables,
      steps,
      execution: {
        id: execution._id.toString(),
        status: execution.status,
        triggerType: execution.triggerType,
      },
      capabilities: this.capabilities,
      resolveConnection: (connectionId) => this.resolveConnection(connectionId),
      logger: {
        info: (metadata, message) => this.log('info', metadata, message),
        warn: (metadata, message) => this.log('warn', metadata, message),
      },
    };
  }

  private async currentAttempt(executionId: string): Promise<number> {
    const step = await this.stepModel
      .findOne({ executionId })
      .sort({ attempt: -1 })
      .exec();
    return step?.attempt ?? 0;
  }

  private async resolveConnection(
    connectionId: string,
  ): Promise<Record<string, unknown>> {
    const connection = await this.connectionModel
      .findById(connectionId)
      .select('+secretCiphertext')
      .exec();
    if (!connection || connection.status === 'disabled') {
      throw new WorkflowActionFailure(
        'CONNECTION_UNAVAILABLE',
        'Workflow connection is unavailable',
        false,
      );
    }
    let secret: string | undefined;
    if (connection.secretCiphertext) {
      secret = new IntegrationSecretVault(env.INTEGRATION_SECRET_ENCRYPTION_KEY).decrypt(
        connection.secretCiphertext,
      );
    }
    return {
      id: connection._id.toString(),
      extensionId: connection.extensionId,
      name: connection.name,
      status: connection.status,
      configuration: connection.configuration,
      ...(secret ? { secret } : {}),
    };
  }

  private async markSkipped(executionId: string, node: WorkflowNode): Promise<void> {
    await this.stepModel
      .updateOne(
        { executionId, nodeId: node.id },
        {
          $set: { status: 'skipped', completedAt: new Date() },
          $setOnInsert: { _id: randomUUID(), executionId, nodeId: node.id, attempt: 0 },
        },
        { upsert: true },
      )
      .exec();
  }

  private async failExecution(
    execution: WorkflowExecutionDocument,
    error: { code: string; message: string; retryable: boolean },
  ): Promise<void> {
    execution.status = 'failed';
    execution.completedAt = new Date();
    execution.error = SanitizedExecutionErrorSchema.parse(error);
    execution.set('nextRunAt', undefined);
    await execution.save();
  }

  private schedule(executionId: string, delayMs: number): void {
    const timer = setTimeout(
      () => {
        this.timers.delete(timer);
        void this.runExecution(executionId);
      },
      Math.max(0, Math.min(delayMs, 2_147_000_000)),
    );
    timer.unref?.();
    this.timers.add(timer);
  }

  private toExecutionContract(record: WorkflowExecutionRecord): WorkflowExecution {
    return WorkflowExecutionSchema.parse({
      id: record._id.toString(),
      workflowId: record.workflowId,
      workflowVersionId: record.workflowVersionId,
      ...(record.workspaceId ? { workspaceId: record.workspaceId } : {}),
      ...(record.pageId ? { pageId: record.pageId } : {}),
      status: record.status,
      triggerType: record.triggerType,
      ...(record.triggerEventId ? { triggerEventId: record.triggerEventId } : {}),
      ...(record.correlationId ? { correlationId: record.correlationId } : {}),
      ...(record.rootExecutionId ? { rootExecutionId: record.rootExecutionId } : {}),
      ...(record.startedAt ? { startedAt: record.startedAt.toISOString() } : {}),
      ...(record.completedAt ? { completedAt: record.completedAt.toISOString() } : {}),
      ...(record.nextRunAt ? { nextRunAt: record.nextRunAt.toISOString() } : {}),
      ...(record.error
        ? { error: SanitizedExecutionErrorSchema.parse(record.error) }
        : {}),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }
  private toStepContract(record: WorkflowStepExecutionRecord): WorkflowStepExecution {
    return WorkflowStepExecutionSchema.parse({
      id: record._id.toString(),
      executionId: record.executionId,
      nodeId: record.nodeId,
      status: record.status,
      attempt: record.attempt,
      ...(record.startedAt ? { startedAt: record.startedAt.toISOString() } : {}),
      ...(record.completedAt ? { completedAt: record.completedAt.toISOString() } : {}),
      ...(record.output !== undefined ? { output: sanitizeValue(record.output) } : {}),
      ...(record.error
        ? { error: SanitizedExecutionErrorSchema.parse(record.error) }
        : {}),
    });
  }
  private notFound(code: string, id: string): NotFoundException {
    return new NotFoundException({ code, message: `${code}: ${id}` });
  }
  private log(
    level: 'info' | 'warn',
    metadata: Record<string, unknown>,
    message: string,
  ): void {
    platformLogger[level](
      {
        component: 'workflow-engine',
        ...(sanitizeValue(metadata) as Record<string, unknown>),
      },
      message,
    );
  }
}

function selectEdges(
  edges: readonly { target: string; branch: string }[],
  result: boolean | undefined,
) {
  if (result === undefined)
    return edges.filter((edge) => edge.branch === 'always' || edge.branch === 'default');
  const expected = result ? 'true' : 'false';
  return edges.filter(
    (edge) =>
      edge.branch === expected || edge.branch === 'always' || edge.branch === 'default',
  );
}

function readBranchResult(output: unknown): boolean | undefined {
  if (!output || typeof output !== 'object') return undefined;
  const result = (output as Record<string, unknown>).result;
  return typeof result === 'boolean' ? result : undefined;
}

function workflowLookup(context: WorkflowExecutionContext): Record<string, unknown> {
  return {
    trigger: context.trigger,
    variables: context.variables,
    steps: context.steps,
    page: { id: context.pageId },
    workspace: { id: context.workspaceId },
  };
}

function resolveObject(
  value: unknown,
  context: Record<string, unknown>,
): Record<string, unknown> {
  const resolved = resolveAny(value, context);
  return resolved && typeof resolved === 'object' && !Array.isArray(resolved)
    ? (resolved as Record<string, unknown>)
    : {};
}
function resolveAny(value: unknown, context: Record<string, unknown>): unknown {
  if (Array.isArray(value)) return value.map((item) => resolveAny(item, context));
  if (typeof value === 'string') {
    const match = /^\{\{\s*([^}]+?)\s*\}\}$/.exec(value);
    if (match) return resolvePath(context, match[1]!);
    return value;
  }
  if (value && typeof value === 'object') {
    if (
      'kind' in value &&
      ((value as Record<string, unknown>).kind === 'binding' ||
        (value as Record<string, unknown>).kind === 'literal')
    ) {
      return resolveWorkflowValue(value as never, context);
    }
    if ('operator' in value) return evaluateWorkflowExpression(value as never, context);
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, resolveAny(child, context)]),
    );
  }
  return value;
}
function resolvePath(context: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[key];
  }, context);
}
function sanitizeValue(value: unknown, key?: string, depth = 0): unknown {
  if (depth > 5) return '[TRUNCATED]';
  if (key && /secret|token|password|authorization|credential|api[-_]?key/i.test(key))
    return '[REDACTED]';
  if (Array.isArray(value))
    return value.slice(0, 100).map((entry) => sanitizeValue(entry, undefined, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 100)
        .map(([entryKey, entryValue]) => [
          entryKey,
          sanitizeValue(entryValue, entryKey, depth + 1),
        ]),
    );
  }
  if (typeof value === 'string')
    return value.length > 20_000 ? `${value.slice(0, 20_000)}…` : value;
  return value;
}
function sanitizeMessage(message: string): string {
  return message
    .replace(/(secret|token|password|authorization)=?[^\s,;]+/gi, '$1=[REDACTED]')
    .slice(0, 500);
}
function retryDelay(definition: WorkflowDefinitionVersion, attempt: number): number {
  return Math.min(
    86_400_000,
    definition.retryPolicy.initialDelayMs *
      Math.pow(definition.retryPolicy.backoffMultiplier, Math.max(0, attempt - 1)),
  );
}
function isDuplicateKey(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000,
  );
}
