import { Injectable, OnModuleInit } from '@nestjs/common';
import { PlanChangeHooks } from '../billing/plan-change-hooks.js';
import { AutomationRunsRepository } from './automation-runs.repository.js';
import { AutomationsRepository } from './automations.repository.js';

/**
 * A change to a plan without automation pauses what is enabled (ADR-035): the automations go to
 * `paused` with reason `plan`, and their waiting runs stop, in the transaction that changes the
 * plan. Enabling again needs a plan with automation. Nothing is deleted.
 */
@Injectable()
export class AutomationPlanPause implements OnModuleInit {
  constructor(
    private readonly hooks: PlanChangeHooks,
    private readonly automations: AutomationsRepository,
    private readonly runs: AutomationRunsRepository,
  ) {}

  onModuleInit(): void {
    // What board 28's dialog says a change to a plan without automation pauses (T3).
    this.hooks.registerFeatureUse('automation', (ref) => this.automations.countEnabled(ref));
    this.hooks.register(async (ref, change, tx) => {
      if (change.to.features.automation) {
        return;
      }
      const paused = await this.automations.pauseForPlan(ref, change.at, tx);
      if (paused.length > 0) {
        await this.runs.stopWaitingOf(ref, paused, change.at, tx);
      }
    });
  }
}
