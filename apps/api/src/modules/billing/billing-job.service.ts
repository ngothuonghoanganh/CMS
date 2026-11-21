import { Injectable, Logger } from '@nestjs/common';
import {
  cardValidAt,
  type PaymentMethod,
  type PlanCatalog,
  type SubscriptionFacts,
  subscriptionStatusOf,
  trialEndCharges,
} from '@plp/contracts';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import type { WorkspaceRef } from '../../shared/persistence/workspace-databases.js';
import { BillingClock } from './billing-clock.js';
import { BillingNotifier, type NoticeOutcome } from './billing-notifier.service.js';
import {
  BillingSchedule,
  type BillingTimeline,
  lacksTransferDetails,
} from './billing-schedule.service.js';
import {
  dueRetryOf,
  graceEndOf,
  nextActionAfter,
  nextRetryOf,
  settleAtOf,
} from './domain/billing-agenda.js';
import { DAY_MS } from './domain/billing-period.js';
import { toObjectId } from '../../shared/persistence/object-id.js';
import {
  awaitsRenewalTransfer,
  awaitsTransfer,
  chargeUndecided,
  invoicePayable,
  isFinalInvoiceStatus,
  payableOf,
  purposeOf,
} from './domain/invoice-state.js';
import {
  currentEndOf,
  paymentUnderWay,
  renewalBlockerOf,
  renewalTermsOf,
  transferInvoiceDue,
} from './domain/renewal.js';
import {
  CHARGE_TIMEOUT_MS,
  type ChargeAttempt,
  InvoiceCharges,
} from './invoice-charges.service.js';
import type { InvoiceRecord } from './invoice.schema.js';
import { InvoicesRepository } from './invoices.repository.js';
import { MarketplacePurchaseHooks } from './marketplace-purchase-hooks.js';
import { BillingLogRepository } from './billing-log.repository.js';
import { PlanChangeHooks } from './plan-change-hooks.js';
import { InjectPlanCatalog, planOf } from './plan-catalog.js';
import { RenewalTransfers } from './renewal-transfers.service.js';
import { SubscriptionsRepository } from './subscriptions.repository.js';

/** How long one run of the job holds a subscription: a charge's wait, with room for the rest. */
export const JOB_HOLD_MS = 2 * 60_000;

/** When a step that could not finish (an email, a blocked charge) is tried again. */
export const JOB_RETRY_MS = 15 * 60_000;

/** What a charge needs of the hold beyond the gateway's answer: recording its outcome. */
const CHARGE_RECORD_MS = 15_000;

/**
 * The billing job (ADR-035, T3): one run for one subscription whose `nextActionAt` is due. It
 * claims the subscription (`lockedUntil`, so only one instance acts and no charge of the owner
 * runs meanwhile), then in order:
 *
 * 1. asks the gateway again, with the same key, about charges whose outcome is unknown; one whose
 *    purpose is over is voided without asking, never charged again;
 * 2. for a plan renewed by bank transfer (T4), makes the next period's invoice `transferLeadDays`
 *    before the end, with the gateway's details and the owner's email;
 * 3. at the end of the trial or period: starts the next period paid before it (T4), or waits for
 *    the transfer invoice made before it (charging it to the card when the method went back to
 *    the card), or makes the invoice of the next period (a scheduled change applied) and charges
 *    the saved card, or records why it could not;
 * 4. makes the latest retry due of a refused charge;
 * 5. sends the emails that are due: the trial's reminder, "Sắp hết hạn", the transfer's due day,
 *    read-only;
 *
 * and lets go with the next `nextActionAt`. Every step reads the facts again and does only what is
 * still due, so a run that stopped half way, or one that runs late, is safe to run again. A charge
 * starts only while the hold lasts long enough for its answer to be recorded.
 */
@Injectable()
export class BillingJob {
  private readonly logger = new Logger(BillingJob.name);

  constructor(
    @InjectPlanCatalog() private readonly catalog: PlanCatalog,
    private readonly clock: BillingClock,
    private readonly subscriptions: SubscriptionsRepository,
    private readonly invoices: InvoicesRepository,
    private readonly charges: InvoiceCharges,
    private readonly schedule: BillingSchedule,
    private readonly notifier: BillingNotifier,
    private readonly purchases: MarketplacePurchaseHooks,
    private readonly renewals: RenewalTransfers,
    private readonly log: BillingLogRepository,
    private readonly hooks: PlanChangeHooks,
    private readonly transactions: TransactionRunner,
  ) {}

  /** One run at `at`; false when the subscription was not due or another instance holds it. */
  async runFor(ref: WorkspaceRef, at: Date): Promise<boolean> {
    const until = new Date(at.getTime() + JOB_HOLD_MS);
    if ((await this.subscriptions.claim(ref, { at, until })) === null) {
      return false;
    }
    const run = new JobRun(at);
    try {
      await this.settleUndecided(ref, run, until);
      await this.issueTransferInvoice(ref, run, until);
      await this.endTrialOrPeriod(ref, run, until);
      await this.retryDue(ref, run, until);
      await this.sendDueNotices(ref, run);
    } catch (error) {
      this.logger.error(
        { workspaceId: ref.workspaceId.toHexString(), err: error },
        'A run of the billing job failed; it runs again later',
      );
      run.again();
    }
    await this.finish(ref, run, until);
    return true;
  }

  /**
   * Charges whose outcome is unknown, asked again when their time came (`settleAtOf`). One whose
   * purpose is over is voided without asking: a charge that never reached the gateway would be
   * made by the question, for what no longer applies.
   */
  private async settleUndecided(ref: WorkspaceRef, run: JobRun, until: Date): Promise<void> {
    const { facts, due, undecided } = await this.schedule.timelineOf(ref);
    const open = [...(due?.status === 'open' ? [due] : []), ...undecided];
    for (const invoice of open) {
      if (settleAtOf(invoice).getTime() > run.at.getTime()) {
        continue;
      }
      if (await this.lapsed(ref, invoice, facts, run.at)) {
        await this.voidUndecided(ref, invoice, run, 'what it paid for no longer applies');
        continue;
      }
      const method = facts.paymentMethod;
      if (method === null) {
        // The key alone cannot be sent without a card; the owner's "Thanh toán lại" asks later.
        continue;
      }
      // The same key: the gateway answers the first charge again and never charges twice.
      const attempt = await this.chargeHeld(ref, invoice, method, run, until);
      if (attempt !== null) {
        await this.afterAttempt(ref, attempt);
      }
    }
  }

  /**
   * A charge of the run, only while its hold lasts until the answer is recorded; null, and the run
   * comes again, when it would not: the owner's charge or another instance may start once it ends.
   */
  private async chargeHeld(
    ref: WorkspaceRef,
    invoice: InvoiceRecord,
    method: PaymentMethod,
    run: JobRun,
    until: Date,
  ): Promise<ChargeAttempt | null> {
    if (this.clock.now().getTime() + CHARGE_TIMEOUT_MS + CHARGE_RECORD_MS > until.getTime()) {
      run.again();
      return null;
    }
    return this.charges.chargeForJob(ref, invoice, method, until);
  }

  /**
   * Whether an undecided invoice's purpose is over: paying it no longer applies, or its period
   * ended. A renewal never is: the subscription waits for it, and it is asked about until known. A
   * marketplace item's is over once the workspace holds the item another way (ADR-036).
   */
  private async lapsed(
    ref: WorkspaceRef,
    invoice: InvoiceRecord,
    facts: SubscriptionFacts,
    at: Date,
  ): Promise<boolean> {
    if (invoice.kind === 'marketplace') {
      const standings = await this.purchases.standingsOf(ref, [invoice]);
      const { access } = subscriptionStatusOf(facts, this.catalog, at);
      return !payableOf(invoice, facts, at, standings.get(invoice.item.itemId), access);
    }
    const purpose = purposeOf(invoice);
    if (purpose === 'renewal' || purpose === 'trial_end') {
      return false;
    }
    return !invoicePayable(invoice, facts, at) || at.getTime() >= invoice.periodEnd.getTime();
  }

  private async voidUndecided(
    ref: WorkspaceRef,
    invoice: InvoiceRecord,
    run: JobRun,
    why: string,
  ): Promise<void> {
    const voided = await this.transactions.run(async (tx) => {
      const after = await this.invoices.voidUndecided(invoice._id, run.at, tx);
      if (after !== null) {
        await this.subscriptions.stopWaitingFor(ref, [after._id], tx);
      }
      return after;
    });
    if (voided !== null) {
      // It is never charged again; a payment the gateway reports later for it is refunded.
      this.logger.error(
        {
          workspaceId: ref.workspaceId.toHexString(),
          invoiceId: invoice._id.toHexString(),
          number: invoice.number,
        },
        `Voided an invoice whose charge's outcome is unknown, because ${why}: check it at the gateway and refund it outside the system if it was charged`,
      );
    }
  }

  /**
   * The next period's invoice of a plan renewed by bank transfer, when it is due (T4), then its
   * transfer details and the owner's email, also for one a request made and could not complete.
   * Waits while another charge of the workspace may still go through.
   */
  private async issueTransferInvoice(ref: WorkspaceRef, run: JobRun, until: Date): Promise<void> {
    const timeline = await this.schedule.timelineOf(ref);
    if (transferInvoiceDue(timeline.facts, this.catalog, run.at)) {
      if (await this.blocked(ref, timeline, run)) {
        return;
      }
      const issued = await this.transactions.run(async (tx) => {
        if (!(await this.subscriptions.stillHeld(ref, until, tx))) {
          return null;
        }
        return this.renewals.issueIn(ref, { at: run.at, actorId: null }, tx);
      });
      if (issued?.kind !== 'issued') {
        run.again();
        return;
      }
    }
    // Under the job's hold no card charge of the invoice runs, so a refused one gets them again.
    if ((await this.renewals.complete(ref, { refillRefused: true })) === 'failed') {
      run.again();
    }
  }

  /**
   * The end of the trial, or of the paid period: the next period paid before it starts (T4); the
   * transfer invoice made before it is waited for, or charged to the card; or the next period's
   * invoice is made and charged to the saved card. Nothing to do after "Hủy gói", or while a
   * payment of the period is under way; a trial without a card or a transfer invoice ends
   * read-only (`trial_expired`). Waits while another charge of the workspace may still go through.
   */
  private async endTrialOrPeriod(ref: WorkspaceRef, run: JobRun, until: Date): Promise<void> {
    const timeline = await this.schedule.timelineOf(ref);
    const { facts } = timeline;
    const end = currentEndOf(facts);
    if (run.at.getTime() < end.getTime()) {
      return;
    }
    if (facts.prepaid !== null) {
      await this.rollOver(ref, facts, run, until);
      return;
    }
    if (facts.cancelAtPeriodEnd || paymentUnderWay(facts)) {
      return;
    }
    if (facts.renewalInvoiceId !== null) {
      await this.awaitRenewal(ref, timeline, run, until);
      return;
    }
    if (
      (facts.trialEndsAt !== null && !trialEndCharges(facts)) ||
      facts.renewalMethod === 'transfer'
    ) {
      // A paid period renewed by transfer got its invoice in the step before, or waits for it.
      return;
    }
    if (await this.blocked(ref, timeline, run)) {
      return;
    }
    const terms = renewalTermsOf(facts, (planId) => planOf(this.catalog, planId));
    let invoice: InvoiceRecord;
    try {
      invoice = await this.transactions.run(async (tx) => {
        if (!(await this.subscriptions.stillHeld(ref, until, tx))) {
          throw new RunOvertaken();
        }
        const created = await this.invoices.create(
          {
            workspaceId: ref.workspaceId,
            kind: 'subscription',
            planId: terms.plan.id,
            planName: terms.plan.name,
            cycle: terms.cycle,
            periodStart: terms.periodStart,
            periodEnd: terms.periodEnd,
            amount: terms.amount,
            billingInfo: facts.billingInfo,
            method: 'card',
            card: null,
            from: null,
            endsTrial: facts.trialEndsAt !== null,
            createdBy: null,
            item: null,
            requestKey: null,
          },
          run.at,
          tx,
        );
        const waiting = await this.subscriptions.waitFor(
          ref,
          { invoiceId: created._id, fromVersion: facts.version, at: run.at },
          tx,
        );
        if (!waiting) {
          // Rolls the invoice back with the transaction.
          throw new RunOvertaken();
        }
        return created;
      });
    } catch (error) {
      if (!(error instanceof RunOvertaken)) {
        throw error;
      }
      // Another instance took over, or the owner changed the plan meanwhile: the next run sees.
      run.again();
      return;
    }
    await this.charge(ref, invoice, facts, run, until);
  }

  /**
   * The end of a trial or period whose next one was paid before it (T4): that period starts, on the
   * plan and cycle paid for (a scheduled change applied now), with no charge.
   */
  private async rollOver(
    ref: WorkspaceRef,
    facts: SubscriptionFacts,
    run: JobRun,
    until: Date,
  ): Promise<void> {
    const prepaid = facts.prepaid;
    if (prepaid === null) {
      return;
    }
    const at = run.at;
    const from = planOf(this.catalog, facts.planId);
    const to = planOf(this.catalog, prepaid.planId);
    const moved = await this.transactions.run(async (tx) => {
      if (
        !(await this.subscriptions.stillHeld(ref, until, tx)) ||
        !(await this.subscriptions.rollOver(ref, { prepaid, fromVersion: facts.version, at }, tx))
      ) {
        return false;
      }
      const before = { planId: facts.planId, cycle: facts.cycle };
      const after = { planId: prepaid.planId, cycle: prepaid.cycle };
      const paid = { invoiceId: toObjectId(prepaid.invoiceId) };
      await this.log.record(
        ref,
        {
          at,
          actorId: null,
          action: facts.trialEndsAt === null ? 'period_renewed' : 'paid_plan_started',
          from: before,
          to: after,
          ...paid,
        },
        tx,
      );
      if (
        facts.trialEndsAt === null &&
        (before.planId !== after.planId || before.cycle !== after.cycle)
      ) {
        await this.log.record(
          ref,
          {
            at,
            actorId: null,
            action: 'scheduled_change_applied',
            from: before,
            to: after,
            ...paid,
          },
          tx,
        );
      }
      if (from.id !== to.id) {
        await this.hooks.run(ref, { from, to, at, by: null }, tx);
      }
      return true;
    });
    if (!moved) {
      run.again();
    }
  }

  /**
   * The end of a trial or period whose next period's transfer invoice is unpaid (T4): the
   * subscription waits for it, as for any invoice of an ended period, in the grace and without a
   * failure. When the method went back to the card, the card is charged for that same invoice, by
   * the card's path of T3. A card charge of it the owner made that is still undecided is learnt
   * first (`settleUndecided`).
   */
  private async awaitRenewal(
    ref: WorkspaceRef,
    timeline: BillingTimeline,
    run: JobRun,
    until: Date,
  ): Promise<void> {
    const { facts, renewal } = timeline;
    const invoiceId = facts.renewalInvoiceId;
    if (invoiceId === null) {
      return;
    }
    if (
      renewal === null ||
      renewal.kind === 'marketplace' ||
      isFinalInvoiceStatus(renewal.status)
    ) {
      // Paid or voided by something that did not let go of it: the end goes on as without it.
      await this.transactions.run((tx) =>
        this.subscriptions.setRenewalInvoice(
          ref,
          { invoiceId: null, fromVersion: facts.version, at: run.at },
          tx,
        ),
      );
      run.again();
      return;
    }
    const byCard = facts.renewalMethod === 'card';
    // Awaited without the details to pay it (the gateway failed when it was made, or a card the
    // owner tried was refused): the step before gets them first.
    if (chargeUndecided(renewal) || (!byCard && lacksTransferDetails(renewal))) {
      run.again();
      return;
    }
    if (byCard && (await this.blocked(ref, timeline, run))) {
      return;
    }
    const due = await this.transactions.run(async (tx) => {
      if (
        !(await this.subscriptions.stillHeld(ref, until, tx)) ||
        !(await this.subscriptions.awaitRenewalInvoice(
          ref,
          { invoiceId: renewal._id, fromVersion: facts.version, at: run.at },
          tx,
        ))
      ) {
        return null;
      }
      // Charged like the job's own invoices, which are `open` until charged (T3).
      return byCard && awaitsTransfer(renewal)
        ? await this.invoices.reopenForCard(renewal._id, run.at, tx)
        : renewal;
    });
    if (due === null) {
      run.again();
      return;
    }
    if (byCard) {
      await this.charge(ref, due, facts, run, until);
    }
  }

  /** The latest retry that is due of the refused invoice the subscription waits for. */
  private async retryDue(ref: WorkspaceRef, run: JobRun, until: Date): Promise<void> {
    const timeline = await this.schedule.timelineOf(ref);
    const { facts, due } = timeline;
    if (facts.failedSince === null || due?.status !== 'failed') {
      return;
    }
    if (dueRetryOf(facts.failedSince, this.catalog.retryDays, due.attempts, run.at) === null) {
      return;
    }
    if (await this.blocked(ref, timeline, run)) {
      return;
    }
    await this.charge(ref, due, facts, run, until);
  }

  /** Charges the saved card, or records that there was none that can pay. */
  private async charge(
    ref: WorkspaceRef,
    invoice: InvoiceRecord,
    facts: SubscriptionFacts,
    run: JobRun,
    until: Date,
  ): Promise<void> {
    const method = facts.paymentMethod;
    const attempt =
      method !== null && cardValidAt(method, run.at)
        ? await this.chargeHeld(ref, invoice, method, run, until)
        : await this.charges.recordUncharged(
            invoice,
            method === null ? 'no_payment_method' : 'expired_card',
          );
    if (attempt !== null) {
      await this.afterAttempt(ref, attempt);
    }
  }

  /**
   * Tells the owner a charge of the job was refused, with its next retry and the grace. Like any
   * email of an event, one that fails is logged and not sent again.
   */
  private async afterAttempt(ref: WorkspaceRef, attempt: ChargeAttempt): Promise<void> {
    const { invoice } = attempt;
    // A marketplace item's refusal never concerns the plan (ADR-036).
    if (attempt.outcome !== 'failed' || attempt.code === null || invoice.kind === 'marketplace') {
      return;
    }
    const facts = await this.subscriptions.find(ref);
    if (facts?.failedSince == null || facts.openInvoiceId !== invoice._id.toHexString()) {
      return;
    }
    await this.notifier.chargeFailed(invoice, {
      attempt: attempt.number,
      code: attempt.code,
      nextRetryAt: nextRetryOf(facts.failedSince, this.catalog.retryDays, invoice.attempts),
      graceEndsAt: graceEndOf(facts, this.catalog),
    });
  }

  /**
   * Whether another charge of the workspace may still go through (one the gateway is deciding, or
   * one whose outcome is unknown): no new charge before it is known, so none is made twice.
   */
  private async blocked(
    ref: WorkspaceRef,
    timeline: BillingTimeline,
    run: JobRun,
  ): Promise<boolean> {
    if (timeline.undecided.length > 0 || (await this.invoices.hasPending(ref))) {
      run.again();
      return true;
    }
    return false;
  }

  /**
   * The emails due now: the trial's reminder, "Sắp hết hạn" (both for a card renewal only), the
   * due day of a transfer still awaited (T4), and read-only.
   */
  private async sendDueNotices(ref: WorkspaceRef, run: JobRun): Promise<void> {
    const { facts, due } = await this.schedule.timelineOf(ref);
    const { at } = run;
    const end = currentEndOf(facts);
    const before = (days: number) => end.getTime() - days * DAY_MS;
    const ending =
      !facts.cancelAtPeriodEnd && !paymentUnderWay(facts) && at.getTime() < end.getTime();
    // A transfer's invoice email replaces both (T4); a paid next period needs neither.
    const byCard = facts.renewalMethod === 'card' && facts.prepaid === null;
    if (
      ending &&
      byCard &&
      facts.trialEndsAt !== null &&
      at.getTime() >= before(this.catalog.trialReminderDays)
    ) {
      run.notice(await this.notifier.trialEnding(ref, facts, at));
    }
    if (
      ending &&
      byCard &&
      facts.trialEndsAt === null &&
      at.getTime() >= before(this.catalog.expiringSoonDays)
    ) {
      const blocker = renewalBlockerOf(facts.paymentMethod, end);
      if (blocker !== null) {
        run.notice(await this.notifier.expiringSoon(ref, facts, blocker, at));
      }
    }
    const status = subscriptionStatusOf(facts, this.catalog, at);
    if (
      due !== null &&
      due.kind !== 'marketplace' &&
      facts.failedSince === null &&
      awaitsRenewalTransfer(due) &&
      due.transfer !== null &&
      at.getTime() >= due.periodStart.getTime() &&
      status.access === 'full'
    ) {
      run.notice(await this.notifier.transferDue(due, 'due'));
    }
    if (status.access === 'read_only') {
      const since =
        status.state === 'past_due' || status.state === 'pending_payment'
          ? (status.graceEndsAt ?? end)
          : end;
      run.notice(await this.notifier.readOnly(ref, status.state, since));
    }
  }

  /** Lets go of the subscription with its next time: the timeline's, sooner for a step to redo. */
  private async finish(ref: WorkspaceRef, run: JobRun, until: Date): Promise<void> {
    try {
      await this.transactions.run(async (tx) => {
        const { items } = await this.schedule.timelineOf(ref, tx);
        const next = run.nextAfter(nextActionAfter(items, run.at));
        await this.subscriptions.finishRun(ref, { until, next }, tx);
      });
    } catch (error) {
      // The hold runs out, and the subscription is due again then.
      this.logger.error(
        { workspaceId: ref.workspaceId.toHexString(), err: error },
        'Ending a run of the billing job failed',
      );
    }
  }
}

/** The facts a run read changed before it wrote, or its hold went to another instance. */
class RunOvertaken extends Error {
  constructor() {
    super('The subscription changed, or another run holds it');
    this.name = 'RunOvertaken';
  }
}

/** What one run of the job left to do again soon. */
class JobRun {
  private retryAt: Date | null = null;

  constructor(readonly at: Date) {}

  /** A step could not finish: the job runs again in `JOB_RETRY_MS`. */
  again(): void {
    this.retryAt = new Date(this.at.getTime() + JOB_RETRY_MS);
  }

  /** An email that failed is sent again by the next run, while it is still due. */
  notice(outcome: NoticeOutcome): void {
    if (outcome === 'failed') {
      this.again();
    }
  }

  nextAfter(next: Date | null): Date | null {
    if (this.retryAt === null) {
      return next;
    }
    return next === null || this.retryAt < next ? this.retryAt : next;
  }
}
