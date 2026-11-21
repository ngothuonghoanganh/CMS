import { Injectable } from '@nestjs/common';
import {
  type BillingSummary,
  type ChangePlanRequest,
  findPlan,
  type Plan,
  type PlanCatalog,
  type PlanCatalogResponse,
  type PlanChangeImpacts,
  type PlanChangeQuote,
  type PlanChangeQuoteQuery,
  type PlanLimitKey,
  type SetRenewalMethodRequest,
  type SubscriptionFacts,
  trialEndCharges,
  type WorkspacePlan,
} from '@plp/contracts';
import { validationFailed } from '../../shared/errors.js';
import { toObjectId } from '../../shared/persistence/object-id.js';
import { TransactionRunner, type Tx } from '../../shared/persistence/transaction.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { AccessService } from '../workspaces/access.service.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { BillingLogRepository } from './billing-log.repository.js';
import { toBillingSummary, toPlanChangeQuote, toWorkspacePlan } from './billing-dto.js';
import { BillingSchedule } from './billing-schedule.service.js';
import { awaitsRenewalTransfer, chargeUndecided, invoicePayable } from './domain/invoice-state.js';
import { type PlanChange, planChangeOf } from './domain/plan-change.js';
import { currentEndOf, paymentUnderWay, scheduledChangeOf } from './domain/renewal.js';
import { type Entitlements, EntitlementsService } from './entitlements.service.js';
import { InvoiceCharges } from './invoice-charges.service.js';
import type { InvoiceRecord, PlanInvoiceRecord } from './invoice.schema.js';
import { InvoicesRepository } from './invoices.repository.js';
import {
  paymentPending,
  paymentInProgress,
  paymentUndecided,
  quoteChanged,
  subscriptionChanged,
} from './payment-problems.js';
import { PlanChangeHooks } from './plan-change-hooks.js';
import { InjectPlanCatalog, planOf } from './plan-catalog.js';
import { planChangeUnavailable } from './plan-problems.js';
import { RenewalTransfers } from './renewal-transfers.service.js';
import { SubscriptionsRepository } from './subscriptions.repository.js';

/** A plan change applied (200), or charged and waiting for the gateway to decide (202). */
export interface PlanChangeOutcome {
  summary: BillingSummary;
  pending: boolean;
}

/** Limits counted at any moment, which a lower plan may leave the workspace over. */
const STANDING_LIMITS: readonly PlanLimitKey[] = ['sites', 'members', 'customDomains'];

/** The invoices the banners need: the one an ended period waits for, and the next period's. */
interface BannerInvoices {
  due: PlanInvoiceRecord | null;
  renewal: PlanInvoiceRecord | null;
}

/**
 * The ids of the invoice the period waits for and of the next period's invoice made before the end
 * (T4). Once the end passed, the latter is what the period waits for, also before the billing job
 * made it `openInvoiceId`.
 */
function bannerInvoiceIds(
  facts: SubscriptionFacts,
  at: Date,
): { due: string | null; renewal: string | null } {
  const ended = at.getTime() >= currentEndOf(facts).getTime();
  const early = facts.renewalInvoiceId ?? facts.prepaid?.invoiceId ?? null;
  if (ended) {
    return {
      due: facts.openInvoiceId ?? (facts.prepaid === null ? facts.renewalInvoiceId : null),
      renewal: null,
    };
  }
  return { due: facts.openInvoiceId, renewal: early };
}

/**
 * The ended period waits for its renewal invoice made for a bank transfer (T4), with nothing
 * failed: "Chờ chuyển khoản". Before the job made it `openInvoiceId`, only while the method is the
 * transfer: a card charges it then.
 */
function awaitingTransferOf(facts: SubscriptionFacts, due: InvoiceRecord | null): boolean {
  if (due === null || due.kind === 'marketplace' || facts.failedSince !== null) {
    return false;
  }
  const waitedFor =
    facts.openInvoiceId === due._id.toHexString() || facts.renewalMethod === 'transfer';
  return waitedFor && awaitsRenewalTransfer(due);
}

/**
 * Board 28 (ADR-035): the plans, the workspace's plan and usage, and changing the plan. During the
 * trial a change is free, or paid now, which ends the trial; in a paid period a higher plan is
 * charged for the days left (T2), and a lower price or another cycle is scheduled for the period's
 * end, which charges it (T3). "Hủy gói" stops the plan at the end of the period, "Giữ lại gói"
 * withdraws it, and a canceled plan starts again only when paid now (T3).
 */
@Injectable()
export class BillingService {
  constructor(
    @InjectPlanCatalog() private readonly catalog: PlanCatalog,
    private readonly access: AccessService,
    private readonly entitlements: EntitlementsService,
    private readonly subscriptions: SubscriptionsRepository,
    private readonly invoices: InvoicesRepository,
    private readonly log: BillingLogRepository,
    private readonly hooks: PlanChangeHooks,
    private readonly charges: InvoiceCharges,
    private readonly schedule: BillingSchedule,
    private readonly renewals: RenewalTransfers,
    private readonly transactions: TransactionRunner,
  ) {}

  catalogResponse(): PlanCatalogResponse {
    return { plans: this.catalog.plans, trial: this.catalog.trial };
  }

  /**
   * What every member sees of the plan: its name, limits and features, the access level, and of
   * an unpaid period whether its payment waits for an answer (T3).
   */
  async workspacePlan(user: AuthenticatedUser, workspaceId: string): Promise<WorkspacePlan> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    this.access.require(scope, 'pages.view');
    const entitlements = await this.entitlements.of(scope);
    const { facts, at } = entitlements;
    const dueId = bannerInvoiceIds(facts, at).due;
    const due =
      dueId === null ? null : await this.invoices.findOfWorkspace(scope, toObjectId(dueId));
    return toWorkspacePlan(entitlements, due, awaitingTransferOf(facts, due));
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
    return this.quoteOf(scope, current, target, query);
  }

  /**
   * "Đổi gói" as `quote` describes it. A free change of the trial's plan, its log entry and what
   * other modules do about it (`PlanChangeHooks`) commit together; so does a change scheduled for
   * the period's end (T3). A change that charges needs the amount the owner confirmed and a card
   * that can pay, or a transfer for a plan paid now, then makes its invoice and charges it
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
        await this.renewals.complete(scope);
        return { summary: await this.summaryOf(scope), pending: false };
      case 'scheduled':
        await this.scheduleChange(scope, current, target, request);
        await this.renewals.complete(scope);
        return { summary: await this.summaryOf(scope), pending: false };
      case 'start_paid':
      case 'upgrade': {
        this.charges.requireEnabled();
        const payWith =
          change.mode === 'start_paid' && request.payWith === 'transfer' ? 'transfer' : 'card';
        if (payWith === 'card') {
          this.charges.requireMethod(current.facts, current.at);
        }
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
          throw quoteChanged(await this.quoteOf(scope, current, target, request));
        }
        const answer = await this.charges.checkout(scope, {
          facts: current.facts,
          current: current.plan,
          target,
          cycle: request.cycle,
          change,
          payWith,
          at: current.at,
        });
        return { summary: await this.summaryOf(scope), pending: answer.pending };
      }
    }
  }

  /**
   * Drops the change scheduled for the end of the period (T3); nothing to drop is fine, as after a
   * canceled plan stopped (`scheduledChangeOf`). Not once the period ended or its payment is under
   * way (409 `unpaid`): the renewal invoice charges the scheduled plan, and paying it applies it.
   */
  async cancelScheduledChange(
    user: AuthenticatedUser,
    workspaceId: string,
  ): Promise<BillingSummary> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    this.access.require(scope, 'billing.manage');
    const { facts, plan, at } = await this.entitlements.of(scope);
    const scheduled = scheduledChangeOf(facts, at);
    if (scheduled !== null) {
      if (at.getTime() >= facts.periodEnd.getTime() || paymentUnderWay(facts)) {
        throw planChangeUnavailable('unpaid');
      }
      if (facts.prepaid !== null) {
        throw planChangeUnavailable('next_period_paid');
      }
      await this.transactions.run(async (tx) => {
        await this.writeOrConflict(
          this.subscriptions.setScheduledChange(
            scope,
            { scheduled: null, fromVersion: facts.version, at },
            tx,
          ),
        );
        await this.log.record(
          scope,
          {
            at,
            actorId: scope.userId,
            action: 'scheduled_change_canceled',
            from: { planId: plan.id, cycle: facts.cycle },
            to: scheduled,
          },
          tx,
        );
        await this.reissueRenewal(scope, at, tx);
      });
      await this.renewals.complete(scope);
    }
    return this.summaryOf(scope);
  }

  /**
   * "Hủy gói" (T3): the plan stops at the end of the trial or period; nothing is refunded (§6).
   * Not while a payment is due (`unpaid`), nor once nothing runs (`payment_required`). A change
   * scheduled for the period's end stays: it applies only if the plan is kept.
   */
  async cancel(user: AuthenticatedUser, workspaceId: string): Promise<BillingSummary> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    this.access.require(scope, 'billing.manage');
    const { facts, at } = await this.entitlements.of(scope);
    if (!facts.cancelAtPeriodEnd) {
      if (at.getTime() >= currentEndOf(facts).getTime()) {
        const expired =
          facts.trialEndsAt !== null && !paymentUnderWay(facts) && !trialEndCharges(facts);
        throw planChangeUnavailable(expired ? 'payment_required' : 'unpaid');
      }
      if (facts.trialEndsAt === null && paymentUnderWay(facts)) {
        throw planChangeUnavailable('unpaid');
      }
      if (facts.prepaid !== null) {
        throw planChangeUnavailable('next_period_paid');
      }
      await this.setCancel(scope, facts.version, true, at);
    }
    return this.summaryOf(scope);
  }

  /**
   * "Giữ lại gói" (T3): before the end of the trial or period, the plan goes on, and renews with
   * the change scheduled for the period's end, if any.
   */
  async keep(user: AuthenticatedUser, workspaceId: string): Promise<BillingSummary> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    this.access.require(scope, 'billing.manage');
    const { facts, at } = await this.entitlements.of(scope);
    if (facts.cancelAtPeriodEnd) {
      if (at.getTime() >= currentEndOf(facts).getTime()) {
        throw planChangeUnavailable('payment_required');
      }
      await this.setCancel(scope, facts.version, false, at);
      await this.renewals.complete(scope);
    }
    return this.summaryOf(scope);
  }

  /**
   * "Phương thức thanh toán" (T4): how the next period is paid. The card needs one that can pay
   * now (422); a bank transfer whose invoice time passed gets its invoice at once. An invoice made
   * for the transfer stays when the card is chosen back: the card pays it at the end if the
   * transfer has not.
   */
  async setRenewalMethod(
    user: AuthenticatedUser,
    workspaceId: string,
    request: SetRenewalMethodRequest,
  ): Promise<BillingSummary> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    this.access.require(scope, 'billing.manage');
    this.charges.requireEnabled();
    const { facts, at } = await this.entitlements.of(scope);
    if (request.method === 'card') {
      this.charges.requireMethod(facts, at);
    }
    if (facts.renewalMethod !== request.method) {
      await this.transactions.run(async (tx) => {
        await this.writeOrConflict(
          this.subscriptions.setRenewalMethod(
            scope,
            { method: request.method, fromVersion: facts.version, at },
            tx,
          ),
        );
        await this.log.record(
          scope,
          {
            at,
            actorId: scope.userId,
            action: 'renewal_method_changed',
            renewalMethod: request.method,
          },
          tx,
        );
        await this.renewals.issueIn(scope, { at, actorId: scope.userId }, tx);
        await this.schedule.reschedule(scope, at, tx);
      });
      await this.renewals.complete(scope);
    }
    return this.summaryOf(scope);
  }

  /**
   * In `tx`, after a change of what the next period is or costs, or whether there is one (T4): the
   * unpaid transfer invoice made for it is voided and replaced. 409 `payment_in_progress` while the
   * owner's card charge of that invoice may go through: voiding it could lose a payment. That
   * includes a charge that holds the subscription (`lockedUntil`) and has not reached the invoice
   * yet: the change writes the subscription too, so the two never both commit.
   */
  private async reissueRenewal(scope: WorkspaceScope, at: Date, tx: Tx): Promise<void> {
    const outcome = await this.renewals.reissueIn(
      scope,
      { at, actorId: scope.userId, refuseWhileHeld: true },
      tx,
    );
    switch (outcome.kind) {
      case 'undecided':
        throw outcome.invoice.status === 'open'
          ? paymentUndecided(outcome.invoice)
          : paymentPending(outcome.invoice);
      case 'held':
        throw paymentInProgress();
      case 'done':
        return;
    }
  }

  private async setCancel(
    scope: WorkspaceScope,
    fromVersion: number,
    cancel: boolean,
    at: Date,
  ): Promise<void> {
    await this.transactions.run(async (tx) => {
      await this.writeOrConflict(
        this.subscriptions.setCancelAtPeriodEnd(scope, { cancel, fromVersion, at }, tx),
      );
      await this.log.record(
        scope,
        { at, actorId: scope.userId, action: cancel ? 'cancel_scheduled' : 'cancel_withdrawn' },
        tx,
      );
      await this.schedule.reschedule(scope, at, tx);
      await this.reissueRenewal(scope, at, tx);
    });
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

  private async quoteOf(
    scope: WorkspaceScope,
    current: Entitlements,
    target: Plan,
    choice: Pick<ChangePlanRequest, 'cycle' | 'payNow'>,
  ): Promise<PlanChangeQuote> {
    const change = this.changeOf(current, target, choice);
    const impacts =
      (change.mode === 'scheduled' || change.mode === 'trial_change') &&
      target.id !== current.plan.id
        ? await this.impactsOf(scope, current.plan, target)
        : null;
    // Paying now ends the trial its transfer invoice was made for.
    const voids =
      change.mode === 'scheduled' ||
      change.mode === 'trial_change' ||
      change.mode === 'upgrade' ||
      change.mode === 'start_paid'
        ? await this.renewalInvoiceVoided(scope, current.facts, current.at)
        : null;
    return toPlanChangeQuote(
      change,
      { planId: target.id, cycle: choice.cycle },
      current.facts.paymentMethod,
      current.at,
      impacts,
      voids,
    );
  }

  /**
   * The unpaid transfer invoice of the next period that a change confirmed now voids (T4); null
   * when there is none, or once the end passed (the period waits for it then).
   */
  private async renewalInvoiceVoided(
    scope: WorkspaceScope,
    facts: SubscriptionFacts,
    at: Date,
  ): Promise<{ invoiceId: string; invoiceNumber: string } | null> {
    const id = bannerInvoiceIds(facts, at).renewal;
    if (id === null || facts.prepaid !== null) {
      return null;
    }
    const invoice = await this.invoices.findOfWorkspace(scope, toObjectId(id));
    if (
      invoice === null ||
      chargeUndecided(invoice) ||
      !(invoice.status === 'pending' || invoice.status === 'failed')
    ) {
      return null;
    }
    return { invoiceId: invoice._id.toHexString(), invoiceNumber: invoice.number };
  }

  /**
   * What moving to `target` does to the workspace (board 28's dialog): what it already uses over
   * the new limits, the automations it pauses, the AI uses each month, and the members who all
   * keep their access.
   */
  private async impactsOf(
    scope: WorkspaceScope,
    current: Plan,
    target: Plan,
  ): Promise<PlanChangeImpacts> {
    const [usage, automations] = await Promise.all([
      this.entitlements.usageOf(scope),
      target.features.automation ? Promise.resolve(0) : this.hooks.featureUse(scope, 'automation'),
    ]);
    return {
      overLimits: STANDING_LIMITS.filter((limit) => usage[limit] > target.limits[limit]).map(
        (limit) => ({ limit, used: usage[limit], max: target.limits[limit] }),
      ),
      automationsToPause: automations,
      aiUses: { from: current.limits.aiUses, to: target.limits.aiUses },
      members: usage.members,
    };
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
      await this.reissueRenewal(scope, at, tx);
    });
  }

  /**
   * A lower price or another cycle in a paid period (T3): nothing changes and nothing is charged
   * until the end of the period, whose renewal charges the new plan and cycle and applies them.
   */
  private async scheduleChange(
    scope: WorkspaceScope,
    current: Entitlements,
    target: Plan,
    request: Pick<ChangePlanRequest, 'cycle'>,
  ): Promise<void> {
    const { at, facts } = current;
    const scheduled = { planId: target.id, cycle: request.cycle };
    if (
      facts.scheduledChange?.planId === target.id &&
      facts.scheduledChange.cycle === request.cycle
    ) {
      return;
    }
    await this.transactions.run(async (tx) => {
      await this.writeOrConflict(
        this.subscriptions.setScheduledChange(
          scope,
          { scheduled, fromVersion: facts.version, at },
          tx,
        ),
      );
      await this.log.record(
        scope,
        {
          at,
          actorId: scope.userId,
          action: 'change_scheduled',
          from: { planId: current.plan.id, cycle: facts.cycle },
          to: scheduled,
        },
        tx,
      );
      await this.reissueRenewal(scope, at, tx);
    });
  }

  /** 409 `conflict` when a write guarded by the version read finds it moved. */
  private async writeOrConflict(write: Promise<boolean>): Promise<void> {
    if (!(await write)) {
      throw subscriptionChanged();
    }
  }

  private async summaryOf(scope: WorkspaceScope): Promise<BillingSummary> {
    const month = this.entitlements.currentMonth();
    const [entitlements, usage] = await Promise.all([
      this.entitlements.of(scope),
      this.entitlements.usageOf(scope, month),
    ]);
    const { facts, at } = entitlements;
    const { due, renewal } = await this.bannerInvoices(scope, facts, at);
    return toBillingSummary(entitlements, {
      usage,
      month,
      policy: this.catalog,
      planOf: (planId) => planOf(this.catalog, planId),
      due: due === null ? null : { invoice: due, payable: invoicePayable(due, facts, at) },
      renewalInvoice:
        renewal === null ? null : { invoice: renewal, payable: invoicePayable(renewal, facts, at) },
      awaitingTransfer: awaitingTransferOf(facts, due),
    });
  }

  /** The plan's invoices the banners name (`bannerInvoiceIds`), read together. */
  private async bannerInvoices(
    scope: WorkspaceScope,
    facts: SubscriptionFacts,
    at: Date,
  ): Promise<BannerInvoices> {
    const ids = bannerInvoiceIds(facts, at);
    const find = (id: string | null) =>
      id === null ? Promise.resolve(null) : this.invoices.findOfWorkspace(scope, toObjectId(id));
    const [due, renewal] = await Promise.all([find(ids.due), find(ids.renewal)]);
    const planInvoice = (invoice: InvoiceRecord | null | undefined): PlanInvoiceRecord | null => {
      if (invoice?.kind === 'marketplace') {
        throw new Error(
          `Workspace ${scope.workspaceId.toHexString()} waits for a marketplace invoice; only a plan's invoice is waited for (ADR-036)`,
        );
      }
      return invoice ?? null;
    };
    return { due: planInvoice(due), renewal: planInvoice(renewal) };
  }
}
