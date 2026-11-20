import { Injectable } from '@nestjs/common';
import type { Plan } from '@plp/contracts';
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

/**
 * What other modules do when a workspace's plan changes (ADR-035), e.g. automations pausing with
 * `pausedReason: plan` when the new plan has no automation. A module registers its hook once, at
 * startup (`onModuleInit`); billing never depends on that module.
 */
@Injectable()
export class PlanChangeHooks {
  private readonly hooks: PlanChangeHook[] = [];

  register(hook: PlanChangeHook): void {
    this.hooks.push(hook);
  }

  async run(ref: WorkspaceRef, change: PlanChange, tx: Tx): Promise<void> {
    for (const hook of this.hooks) {
      await hook(ref, change, tx);
    }
  }
}
