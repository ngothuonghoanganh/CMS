import { Injectable } from '@nestjs/common';
import {
  type BillingSummary,
  type ChangePlanRequest,
  findPlan,
  type PlanCatalog,
  type PlanCatalogResponse,
  type WorkspacePlan,
} from '@plp/contracts';
import { AppError, validationFailed } from '../../shared/errors.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { AccessService } from '../workspaces/access.service.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { BillingLogRepository } from './billing-log.repository.js';
import { toBillingSummary, toWorkspacePlan } from './billing-dto.js';
import { EntitlementsService } from './entitlements.service.js';
import { PlanChangeHooks } from './plan-change-hooks.js';
import { InjectPlanCatalog } from './plan-catalog.js';
import { planChangeUnavailable } from './plan-problems.js';
import { SubscriptionsRepository } from './subscriptions.repository.js';

/**
 * Board 28 (ADR-035): the plans, the workspace's plan and usage, and changing the plan. In T1 a
 * plan changes only during the trial, at no charge; paying for a change comes with the gateway
 * (T2), scheduled downgrades with renewals (T3).
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

  /**
   * "Đổi gói" during the trial: the plan and cycle change at once and nothing is charged
   * (ADR-035). The change, its log entry and what other modules do about it (`PlanChangeHooks`)
   * commit together. Outside the trial: 409 `plan_change_unavailable` until payments exist.
   */
  async changePlan(
    user: AuthenticatedUser,
    workspaceId: string,
    request: ChangePlanRequest,
  ): Promise<BillingSummary> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    this.access.require(scope, 'billing.manage');
    const to = findPlan(this.catalog, request.planId);
    if (!to) {
      throw validationFailed([
        { path: ['planId'], code: 'unknown_plan', message: 'Không có gói này' },
      ]);
    }
    const current = await this.entitlements.of(scope);
    if (current.status.state !== 'trialing') {
      throw planChangeUnavailable();
    }
    if (current.plan.id === to.id && current.facts.cycle === request.cycle) {
      return this.summaryOf(scope);
    }
    const { at } = current;
    await this.transactions.run(async (tx) => {
      const changed = await this.subscriptions.changeTrialPlan(
        scope,
        { planId: to.id, cycle: request.cycle, fromVersion: current.facts.version, at },
        tx,
      );
      if (!changed) {
        throw new AppError(409, 'conflict', 'Gói vừa thay đổi', {
          detail: 'Tải lại trang để xem gói hiện tại rồi chọn lại.',
        });
      }
      await this.log.record(
        scope,
        {
          at,
          actorId: scope.userId,
          action: 'plan_changed',
          from: { planId: current.plan.id, cycle: current.facts.cycle },
          to: { planId: to.id, cycle: request.cycle },
        },
        tx,
      );
      await this.hooks.run(scope, { from: current.plan, to, at, by: scope.userId }, tx);
    });
    return this.summaryOf(scope);
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
