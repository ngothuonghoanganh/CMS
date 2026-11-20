import { Injectable } from '@nestjs/common';
import {
  type Plan,
  type PlanCatalog,
  type PlanFeatureKey,
  type PlanLimitKey,
  type PlanUsage,
  type SubscriptionFacts,
  type SubscriptionStatus,
  subscriptionStatusOf,
  type VnMonth,
  vnMonthOf,
} from '@plp/contracts';
import type { Tx } from '../../shared/persistence/transaction.js';
import type { WorkspaceRef } from '../../shared/persistence/workspace-databases.js';
import { BillingClock } from './billing-clock.js';
import { InjectPlanCatalog, planOf } from './plan-catalog.js';
import { planFeatureRequired, planLimitReached } from './plan-problems.js';
import { PlanUsageRepository } from './plan-usage.repository.js';
import { SubscriptionsRepository } from './subscriptions.repository.js';

/** What a workspace's subscription gives it at one moment (ADR-035). */
export interface Entitlements {
  plan: Plan;
  facts: SubscriptionFacts;
  /** Its state and access level at `at`. */
  status: SubscriptionStatus;
  /** The billing clock's time the status was derived at. */
  at: Date;
}

/**
 * The one place that answers what a workspace's plan allows (ADR-035): its plan, limits and
 * features, its state and access level now, and what it uses of each limit. Every module checks
 * its limit or feature here, inside the transaction that creates the thing it counts.
 */
@Injectable()
export class EntitlementsService {
  constructor(
    @InjectPlanCatalog() readonly catalog: PlanCatalog,
    private readonly clock: BillingClock,
    private readonly subscriptions: SubscriptionsRepository,
    private readonly usage: PlanUsageRepository,
  ) {}

  /**
   * The entitlements of the workspace now; null when it has no subscription, which only a
   * workspace stored outside sign-up can lack (startup gives each one a trial).
   */
  async find(ref: WorkspaceRef, tx?: Tx): Promise<Entitlements | null> {
    const facts = await this.subscriptions.find(ref, tx);
    return facts === null ? null : this.entitlementsOf(facts);
  }

  /** As `find`, for a workspace that must have its subscription: missing is a bug (500). */
  async of(ref: WorkspaceRef, tx?: Tx): Promise<Entitlements> {
    const entitlements = await this.find(ref, tx);
    if (entitlements === null) {
      throw new Error(`Workspace ${ref.workspaceId.toHexString()} has no subscription (ADR-035)`);
    }
    return entitlements;
  }

  entitlementsOf(facts: SubscriptionFacts, at: Date = this.clock.now()): Entitlements {
    return {
      plan: planOf(this.catalog, facts.planId),
      facts,
      status: subscriptionStatusOf(facts, this.catalog, at),
      at,
    };
  }

  /** The month AI uses and automation runs count in, by the billing clock. */
  currentMonth(): VnMonth {
    return vnMonthOf(this.clock.now());
  }

  /** What the workspace uses of each limit, AI uses and automation runs in `month`. */
  usageOf(ref: WorkspaceRef, month: VnMonth = this.currentMonth()): Promise<PlanUsage> {
    return this.usage.usageOf(ref, month);
  }

  /** 402 `plan_feature_required` unless the plan includes the feature. */
  requireFeature(entitlements: Pick<Entitlements, 'plan'>, feature: PlanFeatureKey): void {
    if (!entitlements.plan.features[feature]) {
      throw planFeatureRequired(entitlements.plan, feature);
    }
  }

  /**
   * `requireFeature` for a transaction that relies on the feature until it commits (enabling an
   * automation). It holds the subscription first, so a plan change at the same moment conflicts
   * with `tx` and one of them runs again after the other: the plan read here is the plan `tx`
   * commits under, and a change to a plan without the feature never misses what `tx` wrote.
   */
  async requireFeatureIn(ref: WorkspaceRef, feature: PlanFeatureKey, tx: Tx): Promise<void> {
    await this.subscriptions.hold(ref, tx);
    this.requireFeature(await this.of(ref, tx), feature);
  }

  /**
   * 402 `plan_limit_reached` when `adding` more would go past the plan's limit, `used` being what
   * the workspace has now (counted in the same transaction as the creation, ADR-014).
   */
  requireRoom(
    entitlements: Pick<Entitlements, 'plan'>,
    limit: PlanLimitKey,
    used: number,
    adding = 1,
  ): void {
    if (used + adding > entitlements.plan.limits[limit]) {
      throw planLimitReached(entitlements.plan, limit);
    }
  }
}
