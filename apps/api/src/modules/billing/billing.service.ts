import { Injectable } from '@nestjs/common';
import {
  type BillingSummary,
  type ChangePlanRequest,
  findPlan,
  type Plan,
  type PlanCatalog,
  type PlanCatalogResponse,
  type PlanChangeQuote,
  type PlanChangeQuoteQuery,
  type WorkspacePlan,
} from '@plp/contracts';
import { validationFailed } from '../../shared/errors.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { AccessService } from '../workspaces/access.service.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { BillingLogRepository } from './billing-log.repository.js';
import { toBillingSummary, toPlanChangeQuote, toWorkspacePlan } from './billing-dto.js';
import { type PlanChange, planChangeOf } from './domain/plan-change.js';
import { type Entitlements, EntitlementsService } from './entitlements.service.js';
import { InvoiceCharges } from './invoice-charges.service.js';
import { quoteChanged, subscriptionChanged } from './payment-problems.js';
import { PlanChangeHooks } from './plan-change-hooks.js';
import { InjectPlanCatalog } from './plan-catalog.js';
import { planChangeUnavailable } from './plan-problems.js';
import { SubscriptionsRepository } from './subscriptions.repository.js';

/** A plan change applied (200), or charged and waiting for the gateway to decide (202). */
export interface PlanChangeOutcome {
  summary: BillingSummary;
  pending: boolean;
}

/**
 * Board 28 (ADR-035): the plans, the workspace's plan and usage, and changing the plan. During the
 * trial a change is free, or paid now, which ends the trial; in a paid period a higher plan is
 * charged for the days left (T2). Scheduled downgrades and cycle changes come with T3.
 */
@Injectable()
export class BillingService {
  constructor(
    @InjectPlanCatalog() private readonly catalog: PlanCatalog,
    private readonly access: AccessService,
    private readonly entitlements: EntitlementsService,
    private readonly subscriptions: SubscriptionsRepository,
    private readonly log: BillingLogRepository,
    private readonly hooks: PlanChangeHooks,
    private readonly charges: InvoiceCharges,
    private readonly transactions: TransactionRunner,
  ) {}

  catalogResponse(): PlanCatalogResponse {
    return { plans: this.catalog.plans, trial: this.catalog.trial };
  }

  /** What every member sees of the plan: its name, limits and features, and the access level. */
  async workspacePlan(user: AuthenticatedUser, workspaceId: string): Promise<WorkspacePlan> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    this.access.require(scope, 'pages.view');
    return toWorkspacePlan(await this.entitlements.of(scope));
  }

  async summary(user: AuthenticatedUser, workspaceId: string): Promise<BillingSummary> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    this.access.require(scope, 'billing.view');
    return this.summaryOf(scope);
  }

  /** What choosing a plan would do now and charge, with the card that would pay. Never charges. */
  async quote(
    user: AuthenticatedUser,
    workspaceId: string,
    query: PlanChangeQuoteQuery,
  ): Promise<PlanChangeQuote> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    this.access.require(scope, 'billing.manage');
    const target = this.planNamed(query.planId);
    const current = await this.entitlements.of(scope);
    return this.quoteOf(current, target, query);
  }

  /**
   * "Đổi gói" as `quote` describes it. A free change of the trial's plan, its log entry and what
   * other modules do about it (`PlanChangeHooks`) commit together. A change that charges needs
   * the amount the owner confirmed and a card that can pay, then makes its invoice and charges it
   * (`InvoiceCharges`); the plan changes when the invoice is paid.
   */
  async changePlan(
    user: AuthenticatedUser,
    workspaceId: string,
    request: ChangePlanRequest,
  ): Promise<PlanChangeOutcome> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    this.access.require(scope, 'billing.manage');
    const target = this.planNamed(request.planId);
    const current = await this.entitlements.of(scope);
    const change = this.changeOf(current, target, request);
    switch (change.mode) {
      case 'unchanged':
        return { summary: await this.summaryOf(scope), pending: false };
      case 'unavailable':
        throw planChangeUnavailable(change.reason);
      case 'trial_change':
        await this.changeTrialPlan(scope, current, target, request);
        return { summary: await this.summaryOf(scope), pending: false };
      case 'start_paid':
      case 'upgrade': {
        this.charges.requireEnabled();
        this.charges.requireMethod(current.facts, current.at);
        if (request.expectedAmount === undefined) {
          throw validationFailed([
            {
              path: ['expectedAmount'],
              code: 'required',
              message: 'Xác nhận số tiền của báo giá trước khi thanh toán',
            },
          ]);
        }
        if (request.expectedAmount !== change.amount) {
          throw quoteChanged(this.quoteOf(current, target, request));
        }
        const answer = await this.charges.checkout(scope, {
          facts: current.facts,
          current: current.plan,
          target,
          cycle: request.cycle,
          change,
          at: current.at,
        });
        return { summary: await this.summaryOf(scope), pending: answer.pending };
      }
    }
  }

  private planNamed(planId: string): Plan {
    const plan = findPlan(this.catalog, planId);
    if (!plan) {
      throw validationFailed([
        { path: ['planId'], code: 'unknown_plan', message: 'Không có gói này' },
      ]);
    }
    return plan;
  }

  private changeOf(
    current: Entitlements,
    target: Plan,
    choice: Pick<ChangePlanRequest, 'cycle' | 'payNow'>,
  ): PlanChange {
    return planChangeOf({
      facts: current.facts,
      current: current.plan,
      target,
      cycle: choice.cycle,
      payNow: choice.payNow,
      now: current.at,
    });
  }

  private quoteOf(
    current: Entitlements,
    target: Plan,
    choice: Pick<ChangePlanRequest, 'cycle' | 'payNow'>,
  ): PlanChangeQuote {
    const change = this.changeOf(current, target, choice);
    return toPlanChangeQuote(
      change,
      { planId: target.id, cycle: choice.cycle },
      current.facts.paymentMethod,
      current.at,
    );
  }

  /** During the trial: at once, at no charge, from the version read (ADR-035, T1). */
  private async changeTrialPlan(
    scope: WorkspaceScope,
    current: Entitlements,
    target: Plan,
    request: Pick<ChangePlanRequest, 'cycle'>,
  ): Promise<void> {
    const { at } = current;
    await this.transactions.run(async (tx) => {
      const changed = await this.subscriptions.changeTrialPlan(
        scope,
        { planId: target.id, cycle: request.cycle, fromVersion: current.facts.version, at },
        tx,
      );
      if (!changed) {
        throw subscriptionChanged();
      }
      await this.log.record(
        scope,
        {
          at,
          actorId: scope.userId,
          action: 'plan_changed',
          from: { planId: current.plan.id, cycle: current.facts.cycle },
          to: { planId: target.id, cycle: request.cycle },
        },
        tx,
      );
      await this.hooks.run(scope, { from: current.plan, to: target, at, by: scope.userId }, tx);
    });
  }

  private async summaryOf(scope: WorkspaceScope): Promise<BillingSummary> {
    const month = this.entitlements.currentMonth();
    const [entitlements, usage] = await Promise.all([
      this.entitlements.of(scope),
      this.entitlements.usageOf(scope, month),
    ]);
    return toBillingSummary(entitlements, usage, month);
  }
}
