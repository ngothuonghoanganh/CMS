import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { findPlan, type PlanCatalog } from '@plp/contracts';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import { WorkspacesRepository } from '../workspaces/workspaces.repository.js';
import { BillingClock } from './billing-clock.js';
import { newTrial } from './domain/new-trial.js';
import { InjectPlanCatalog } from './plan-catalog.js';
import { SubscriptionsRepository } from './subscriptions.repository.js';

const BATCH = 500;

/**
 * Before the API serves (ADR-035, Consequences): every plan a subscription uses must be in the
 * catalog, or startup fails; and every workspace without a subscription, created before plans
 * existed, gets a fresh trial. Safe to run again and on several instances at once.
 */
@Injectable()
export class SubscriptionBackfill implements OnApplicationBootstrap {
  private readonly logger = new Logger(SubscriptionBackfill.name);

  constructor(
    @InjectPlanCatalog() private readonly catalog: PlanCatalog,
    private readonly clock: BillingClock,
    private readonly subscriptions: SubscriptionsRepository,
    private readonly workspaces: WorkspacesRepository,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.checkPlansInUse();
    const given = await this.run();
    if (given > 0) {
      this.logger.log({ given }, 'Gave a trial to the workspaces without a subscription');
    }
  }

  /** A plan removed from the catalog while workspaces are on it would leave them without one. */
  async checkPlansInUse(): Promise<void> {
    const missing = (await this.subscriptions.plansInUse()).filter(
      (planId) => findPlan(this.catalog, planId) === undefined,
    );
    if (missing.length > 0) {
      throw new Error(
        `The plan catalog lacks plans that subscriptions use: ${missing.join(', ')} (ADR-035)`,
      );
    }
  }

  /** Gives a trial from now to each workspace without a subscription; how many it gave. */
  async run(): Promise<number> {
    const now = this.clock.now();
    const trial = newTrial(this.catalog, now);
    let given = 0;
    let batch: ObjectId[] = [];
    for await (const workspaceId of this.workspaces.allIds()) {
      batch.push(workspaceId);
      if (batch.length === BATCH) {
        given += await this.subscriptions.createMissing(batch, trial, now);
        batch = [];
      }
    }
    return given + (await this.subscriptions.createMissing(batch, trial, now));
  }
}
