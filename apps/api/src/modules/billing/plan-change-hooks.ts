import { Injectable } from '@nestjs/common';
import type { Plan, PlanFeatureKey } from '@plp/contracts';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import type { WorkspaceRef } from '../../shared/persistence/workspace-databases.js';

export interface PlanChange {
  from: Plan;
  to: Plan;
  at: Date;
  /** The member who changed it; null for a change the subscription's job applies (T3). */
  by: ObjectId | null;
}

/**
 * Runs inside the transaction that changes the plan: when it throws, the plan does not change.
 * It must stay within the database (the transaction may run more than once).
 */
export type PlanChangeHook = (ref: WorkspaceRef, change: PlanChange, tx: Tx) => Promise<void>;

/** How many things of a workspace use a feature now (enabled automations), read outside writes. */
export type PlanFeatureUse = (ref: WorkspaceRef) => Promise<number>;

/**
 * What other modules do when a workspace's plan changes (ADR-035), e.g. automations pausing with
 * `pausedReason: plan` when the new plan has no automation. A module registers its hook once, at
 * startup (`onModuleInit`); billing never depends on that module. It also says what a change to a
 * plan without a feature would stop (`featureUse`, board 28's dialog, T3).
 */
@Injectable()
export class PlanChangeHooks {
  private readonly hooks: PlanChangeHook[] = [];
  private readonly uses = new Map<PlanFeatureKey, PlanFeatureUse>();

  register(hook: PlanChangeHook): void {
    this.hooks.push(hook);
  }

  /** What losing `feature` stops in a workspace, counted by the module that owns it. */
  registerFeatureUse(feature: PlanFeatureKey, count: PlanFeatureUse): void {
    this.uses.set(feature, count);
  }

  /** How many things a change to a plan without `feature` stops; 0 when no module counts it. */
  featureUse(ref: WorkspaceRef, feature: PlanFeatureKey): Promise<number> {
    return this.uses.get(feature)?.(ref) ?? Promise.resolve(0);
  }

  async run(ref: WorkspaceRef, change: PlanChange, tx: Tx): Promise<void> {
    for (const hook of this.hooks) {
      await hook(ref, change, tx);
    }
  }
}
