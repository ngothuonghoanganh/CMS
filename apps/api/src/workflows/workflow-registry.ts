import { Inject, Injectable, Optional } from '@nestjs/common';
import { WorkflowRegistryEntrySchema } from '@payload/contracts';
import { CapabilityRegistry } from '../extensions/capability-registry';
import { ContributionRegistry } from '../extensions/contribution-registry';
import type {
  WorkflowActionResult,
  WorkflowExecutionContext,
  WorkflowNodeCategory,
  WorkflowRegistryEntry,
} from './workflow-runtime-types';

export type WorkflowTriggerDefinition = WorkflowRegistryEntry & {
  eventType?: string;
  outputSchema?: unknown;
  validateConfig?: (config: Record<string, unknown>) => void;
};

export type WorkflowConditionDefinition = WorkflowRegistryEntry & {
  evaluate?: (left: unknown, right: unknown) => boolean;
};

export type WorkflowActionDefinition = WorkflowRegistryEntry & {
  requiredCapability?: string;
  validateConfig?: (config: Record<string, unknown>) => void;
  execute?: (
    context: WorkflowExecutionContext,
    input: Record<string, unknown>,
  ) => Promise<WorkflowActionResult>;
};

@Injectable()
export class WorkflowTriggerRegistry {
  private readonly definitions = new Map<string, WorkflowTriggerDefinition>();

  register(definition: WorkflowTriggerDefinition): void {
    const { eventType, validateConfig, outputSchema, ...metadata } = definition;
    const parsed = WorkflowRegistryEntrySchema.parse({
      ...metadata,
      category: 'trigger',
    });
    if (this.definitions.has(parsed.type)) {
      throw new Error(`WORKFLOW_TRIGGER_DUPLICATE:${parsed.type}`);
    }
    this.definitions.set(parsed.type, {
      ...definition,
      ...parsed,
      category: 'trigger',
      ...(eventType ? { eventType } : {}),
      ...(outputSchema ? { outputSchema } : {}),
      ...(validateConfig ? { validateConfig } : {}),
    });
  }

  has(type: string): boolean {
    return this.definitions.has(type);
  }
  get(type: string): WorkflowTriggerDefinition | undefined {
    return this.definitions.get(type);
  }
  list(): WorkflowTriggerDefinition[] {
    return [...this.definitions.values()].sort((left, right) =>
      left.type.localeCompare(right.type),
    );
  }
}

@Injectable()
export class WorkflowConditionRegistry {
  private readonly definitions = new Map<string, WorkflowConditionDefinition>();

  register(definition: WorkflowConditionDefinition): void {
    const { evaluate, ...metadata } = definition;
    const parsed = WorkflowRegistryEntrySchema.parse({
      ...metadata,
      category: 'condition',
    });
    if (this.definitions.has(parsed.type)) {
      throw new Error(`WORKFLOW_CONDITION_DUPLICATE:${parsed.type}`);
    }
    this.definitions.set(parsed.type, {
      ...definition,
      ...parsed,
      category: 'condition',
      ...(evaluate ? { evaluate } : {}),
    });
  }
  has(type: string): boolean {
    return this.definitions.has(type);
  }
  get(type: string): WorkflowConditionDefinition | undefined {
    return this.definitions.get(type);
  }
  list(): WorkflowConditionDefinition[] {
    return [...this.definitions.values()].sort((left, right) =>
      left.type.localeCompare(right.type),
    );
  }
}

@Injectable()
export class WorkflowActionRegistry {
  private readonly definitions = new Map<string, WorkflowActionDefinition>();

  register(definition: WorkflowActionDefinition): void {
    const { requiredCapability, validateConfig, execute, ...metadata } = definition;
    const parsed = WorkflowRegistryEntrySchema.parse({ ...metadata, category: 'action' });
    if (this.definitions.has(parsed.type)) {
      throw new Error(`WORKFLOW_ACTION_DUPLICATE:${parsed.type}`);
    }
    this.definitions.set(parsed.type, {
      ...definition,
      ...parsed,
      category: 'action',
      ...(requiredCapability ? { requiredCapability } : {}),
      ...(validateConfig ? { validateConfig } : {}),
      ...(execute ? { execute } : {}),
    });
  }
  has(type: string): boolean {
    return this.definitions.has(type);
  }
  get(type: string): WorkflowActionDefinition | undefined {
    return this.definitions.get(type);
  }
  list(): WorkflowActionDefinition[] {
    return [...this.definitions.values()].sort((left, right) =>
      left.type.localeCompare(right.type),
    );
  }
}

@Injectable()
export class WorkflowRegistryFacade {
  constructor(
    @Inject(WorkflowTriggerRegistry) private readonly triggers: WorkflowTriggerRegistry,
    @Inject(WorkflowConditionRegistry)
    private readonly conditions: WorkflowConditionRegistry,
    @Inject(WorkflowActionRegistry) private readonly actions: WorkflowActionRegistry,
    @Inject(CapabilityRegistry) private readonly capabilities: CapabilityRegistry,
    @Optional()
    @Inject(ContributionRegistry)
    private readonly contributions?: ContributionRegistry,
  ) {}

  refreshContributions(): void {
    for (const entry of this.contributions?.list() ?? []) {
      const category = contributionCategory(entry.contribution.type);
      if (!category) continue;
      const provider = entry.provider as
        | {
            execute?: WorkflowActionDefinition['execute'];
            eventType?: string;
            evaluate?: WorkflowConditionDefinition['evaluate'];
          }
        | undefined;
      const definition = {
        type: entry.contribution.id,
        category,
        label: entry.contribution.label,
        ...(entry.contribution.capability
          ? { capability: entry.contribution.capability }
          : {}),
        extensionId: entry.extensionId,
        ...(provider?.eventType ? { eventType: provider.eventType } : {}),
        ...(provider?.execute ? { execute: provider.execute } : {}),
        ...(provider?.evaluate ? { evaluate: provider.evaluate } : {}),
      };
      try {
        if (category === 'trigger' && !this.triggers.has(definition.type)) {
          this.triggers.register(definition);
        } else if (category === 'condition' && !this.conditions.has(definition.type)) {
          this.conditions.register(definition);
        } else if (category === 'action' && !this.actions.has(definition.type)) {
          this.actions.register(definition);
        }
      } catch {
        // A malformed optional contribution must not hide the core registry.
      }
    }
  }

  available(): {
    triggers: WorkflowTriggerDefinition[];
    conditions: WorkflowConditionDefinition[];
    actions: WorkflowActionDefinition[];
  } {
    this.refreshContributions();
    return {
      triggers: this.triggers.list(),
      conditions: this.conditions.list(),
      actions: this.actions.list(),
    };
  }

  requireCapability(capability: string): unknown {
    const provider = this.capabilities.resolve(capability);
    if (!provider) throw new Error(`WORKFLOW_CAPABILITY_UNAVAILABLE:${capability}`);
    return provider.provider;
  }
}

function contributionCategory(type: string): WorkflowNodeCategory | undefined {
  if (type === 'trigger') return 'trigger';
  if (type === 'condition') return 'condition';
  if (type === 'action') return 'action';
  return undefined;
}
