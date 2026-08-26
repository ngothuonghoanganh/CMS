import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  WorkflowActionRegistry,
  WorkflowConditionRegistry,
  WorkflowTriggerRegistry,
} from './workflow-registry';
import type {
  WorkflowActionResult,
  WorkflowExecutionContext,
} from './workflow-runtime-types';
import { evaluateWorkflowExpression } from './workflow-condition';
import { CapabilityRegistry } from '../extensions/capability-registry';

export class WorkflowActionFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}

@Injectable()
export class CoreWorkflowContributions implements OnModuleInit {
  constructor(
    @Inject(WorkflowTriggerRegistry) private readonly triggers: WorkflowTriggerRegistry,
    @Inject(WorkflowConditionRegistry)
    private readonly conditions: WorkflowConditionRegistry,
    @Inject(WorkflowActionRegistry) private readonly actions: WorkflowActionRegistry,
    @Inject(CapabilityRegistry) private readonly capabilities: CapabilityRegistry,
  ) {}

  onModuleInit(): void {
    this.registerReferenceCapabilities();
    this.registerTriggers();
    this.registerConditions();
    this.registerActions();
  }

  private registerReferenceCapabilities(): void {
    for (const capability of [
      'mail.send',
      'webhook.send',
      'analytics.track',
      'payment.checkout',
      'payment.refund',
      'order.create',
      'cart.update',
    ]) {
      if (!this.capabilities.has(capability)) {
        this.capabilities.register(capability, 'workflow-reference', {
          execute: async (
            _context: WorkflowExecutionContext,
            input: Record<string, unknown>,
          ) => ({
            accepted: true,
            capability,
            input,
          }),
        });
      }
    }
  }

  private registerTriggers(): void {
    const definitions = [
      ['form.submitted', 'Form Submitted', 'form.submitted'],
      ['page.viewed', 'Page Viewed', 'page.viewed'],
      ['button.clicked', 'Button Clicked', 'button.clicked'],
      ['page.published', 'Page Published', 'page.published'],
      ['lead.created', 'Lead Created', 'lead.created'],
      ['payment.completed', 'Payment Completed', 'payment.completed'],
      ['payment.failed', 'Payment Failed', 'payment.failed'],
      ['order.created', 'Order Created', 'order.created'],
      ['order.completed', 'Order Completed', 'order.completed'],
      ['booking.created', 'Booking Created', 'booking.created'],
      ['cart.abandoned', 'Cart Abandoned', 'cart.abandoned'],
      ['manual', 'Manual', undefined],
    ] as const;
    for (const [type, label, eventType] of definitions) {
      if (this.triggers.has(type)) continue;
      this.triggers.register({
        type,
        category: 'trigger',
        label,
        ...(eventType ? { eventType } : {}),
      });
    }
  }

  private registerConditions(): void {
    const conditions = [
      'equals',
      'notEquals',
      'contains',
      'notContains',
      'exists',
      'notExists',
      'greaterThan',
      'greaterThanOrEqual',
      'lessThan',
      'lessThanOrEqual',
      'AND',
      'OR',
      'NOT',
    ];
    for (const type of conditions) {
      if (this.conditions.has(type)) continue;
      this.conditions.register({ type, category: 'condition', label: type });
    }
  }

  private registerActions(): void {
    this.register(
      { type: 'condition.evaluate', label: 'Evaluate Condition' },
      async (context, input) => ({
        output: {
          result: evaluateWorkflowExpression(
            input.expression as never,
            workflowLookup(context),
          ),
        },
      }),
    );
    this.register({ type: 'delay', label: 'Delay' }, async (_context, input) => ({
      waitUntil: new Date(Date.now() + durationMs(input)),
      output: { scheduled: true },
    }));
    this.register(
      { type: 'lead.create', label: 'Create Lead' },
      async (_context, input) => ({
        output: {
          lead: {
            id: typeof input.id === 'string' ? input.id : randomUUID(),
            ...input,
            createdAt: new Date().toISOString(),
          },
        },
      }),
    );
    this.register(
      { type: 'data.create', label: 'Create Data' },
      async (_context, input) => ({
        output: {
          record: { id: randomUUID(), ...input, createdAt: new Date().toISOString() },
        },
      }),
    );
    this.register(
      { type: 'data.update', label: 'Update Data' },
      async (_context, input) => ({
        output: { record: input },
      }),
    );
    this.register(
      { type: 'data.query', label: 'Query Data' },
      async (_context, input) => ({
        output: { items: [], query: input },
      }),
    );

    this.registerCapabilityAction('mail.send', 'mail.send', 'Send Email');
    this.registerCapabilityAction('webhook.send', 'webhook.send', 'Send Webhook');
    this.registerCapabilityAction(
      'analytics.track',
      'analytics.track',
      'Track Analytics',
    );
    this.registerCapabilityAction(
      'payment.checkout',
      'payment.checkout',
      'Payment Checkout',
    );
    this.registerCapabilityAction('payment.refund', 'payment.refund', 'Payment Refund');
    this.registerCapabilityAction('order.create', 'order.create', 'Create Order');
    this.registerCapabilityAction('cart.update', 'cart.update', 'Update Cart');
  }

  private register(
    definition: { type: string; label: string; capability?: string },
    execute: (
      context: WorkflowExecutionContext,
      input: Record<string, unknown>,
    ) => Promise<WorkflowActionResult>,
  ): void {
    if (this.actions.has(definition.type)) return;
    this.actions.register({
      type: definition.type,
      category: 'action',
      label: definition.label,
      ...(definition.capability ? { capability: definition.capability } : {}),
      ...(definition.capability ? { requiredCapability: definition.capability } : {}),
      execute,
    });
  }

  private registerCapabilityAction(
    type: string,
    capability: string,
    label: string,
  ): void {
    this.register({ type, label, capability }, async (context, input) => {
      const provider = context.capabilities.resolve(capability)?.provider as
        | {
            execute?: (
              context: WorkflowExecutionContext,
              input: Record<string, unknown>,
            ) => Promise<unknown>;
          }
        | undefined;
      if (!provider?.execute) {
        return { output: { accepted: true, capability, input } };
      }
      return { output: await provider.execute(context, input) };
    });
  }
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

function durationMs(input: Record<string, unknown>): number {
  if (typeof input.durationMs === 'number' && Number.isFinite(input.durationMs)) {
    return Math.max(0, Math.min(input.durationMs, 31_536_000_000));
  }
  const amount = typeof input.amount === 'number' ? input.amount : 1;
  const unit = typeof input.unit === 'string' ? input.unit : 'minutes';
  const multiplier =
    unit === 'seconds'
      ? 1_000
      : unit === 'hours'
        ? 3_600_000
        : unit === 'days'
          ? 86_400_000
          : 60_000;
  return Math.max(0, Math.min(amount * multiplier, 31_536_000_000));
}
