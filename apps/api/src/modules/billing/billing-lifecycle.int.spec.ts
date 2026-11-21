import {
  type BillingSummary,
  billingSummarySchema,
  endpoints,
  invoiceReceiptSchema,
  invoiceSchema,
  payInvoiceResponseSchema,
  problemSchema,
  startTransferResponseSchema,
  workspacePlanSchema,
} from '@plp/contracts';
import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import { createSecondInstance } from '../../../test/instances.js';
import { uniqueSubdomain } from '../../../test/resources.js';
import {
  addCard,
  CARD_DECLINED,
  CARD_NO_FUNDS,
  CARD_OK,
  fakeGateway,
  invoicesOf,
  newEventId,
  payInvoice,
  postGatewayEvent,
} from '../../../test/payments.js';
import { BUNDLED_PLAN_CATALOG_FILE } from '../../config/env.js';
import { BillingClock } from './billing-clock.js';
import { BillingScheduler } from './billing-scheduler.service.js';
import { periodEndOf } from './domain/billing-period.js';
import { vnDateText } from './domain/billing-text.js';
import { type PlanChange, PlanChangeHooks } from './plan-change-hooks.js';

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
/** 10:00 on 01/11/2026 in Vietnam: the trials of this file start then. */
const START = new Date('2026-11-01T03:00:00.000Z');
const after = (from: Date, days: number, ms = 0) => new Date(from.getTime() + days * DAY_MS + ms);

describe('the life of a plan (ADR-035, T3)', () => {
  let t: TestApp;
  let clock: BillingClock;
  let scheduler: BillingScheduler;
  const changes: Array<{ workspaceId: string; change: PlanChange }> = [];

  beforeAll(async () => {
    t = await createTestApp('plp_test_billing_lifecycle', {
      env: { BILLING_TEST_CLOCK: 'on', PLAN_CATALOG_FILE: BUNDLED_PLAN_CATALOG_FILE },
    });
    clock = t.app.get(BillingClock);
    scheduler = t.app.get(BillingScheduler);
    t.app.get(PlanChangeHooks).register((ref, change) => {
      changes.push({ workspaceId: ref.workspaceId.toHexString(), change });
      return Promise.resolve();
    });
  });

  afterEach(async () => {
    clock.set(null);
    vi.restoreAllMocks();
    // Each test's workspaces stay out of the next tests' runs of the job.
    await t.connection.collection('subscriptions').updateMany({}, { $set: { nextActionAt: null } });
  });

  afterAll(async () => {
    await t.close();
  });

  const subscriptionOf = (workspaceId: string) =>
    t.connection.collection('subscriptions').findOne({ _id: new Types.ObjectId(workspaceId) });
  const logOf = async (workspaceId: string) =>
    (
      await t.connection
        .collection('billing_log')
        .find({ workspaceId: new Types.ObjectId(workspaceId) })
        .sort({ _id: 1 })
        .toArray()
    ).map((entry) => entry['action'] as string);
  const emailsTo = (email: string, template: string) =>
    t.emails.sent.filter((sent) => sent.template === template && sent.to.includes(email));
  const toldOf = (workspaceId: string) =>
    changes
      .filter((item) => item.workspaceId === workspaceId)
      .map(({ change }) => [change.from.id, change.to.id]);

  /** Moves the billing clock to `at` and runs the job's due work there, as `PUT /testing/clock`. */
  async function runAt(at: Date): Promise<number> {
    clock.set(at);
    return scheduler.runDue();
  }

  async function summaryOf(owner: TestClient, workspaceId: string): Promise<BillingSummary> {
    return billingSummarySchema.parse(
      (await owner.get(endpoints.getBillingSummary.path(workspaceId)).expect(200)).body,
    );
  }

  /** A stored time of the subscription. */
  async function storedTime(workspaceId: string, field: string): Promise<Date> {
    const value: unknown = (await subscriptionOf(workspaceId))?.[field];
    if (!(value instanceof Date)) {
      throw new Error(`The subscription has no ${field}`);
    }
    return value;
  }

  /**
   * The period a paid invoice pays for, as the invoice and its receipt both say, and when it was
   * paid.
   */
  async function paidPeriodOf(owner: TestClient, workspaceId: string, invoiceId: string) {
    const invoice = invoiceSchema.parse(
      (await owner.get(endpoints.getInvoice.path(workspaceId, invoiceId)).expect(200)).body,
    );
    const receipt = invoiceReceiptSchema.parse(
      (await owner.get(endpoints.getInvoiceReceipt.path(workspaceId, invoiceId)).expect(200)).body,
    );
    expect(invoice.status).toBe('paid');
    expect(receipt.invoice).toMatchObject({
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
    });
    return {
      paidAt: new Date(invoice.paidAt ?? ''),
      period: {
        start: new Date(invoice.periodStart ?? ''),
        end: new Date(invoice.periodEnd ?? ''),
      },
    };
  }

  /** The plan works again for `period`, whose end is the job's next work: its renewal. */
  async function expectFreshPeriod(
    owner: TestClient,
    workspaceId: string,
    period: { start: Date; end: Date },
  ): Promise<void> {
    expect(await summaryOf(owner, workspaceId)).toMatchObject({
      state: 'active',
      access: 'full',
      periodStart: period.start.toISOString(),
      periodEnd: period.end.toISOString(),
      failedSince: null,
      dueInvoice: null,
      renewal: { at: period.end.toISOString(), amount: 599_000 },
    });
    expect(await subscriptionOf(workspaceId)).toMatchObject({ nextActionAt: period.end });
  }

  /**
   * A new owner on a 14-day trial of Gói Agency from about START: the sign-up takes a moment of
   * the running billing clock, so `trialEnd` is read back.
   */
  async function trialing(): Promise<{
    owner: TestClient;
    workspaceId: string;
    email: string;
    trialEnd: Date;
  }> {
    clock.set(START);
    const { client, workspaceId, me } = await signedUpClient(t.app);
    return {
      owner: client,
      workspaceId,
      email: me.user.email,
      trialEnd: await storedTime(workspaceId, 'trialEndsAt'),
    };
  }

  /** A trial whose end the job charged with `card`: a month from its end, paid or not. */
  async function paying(card = CARD_OK) {
    const owner = await trialing();
    await addCard(t, owner.owner, owner.workspaceId, card);
    await runAt(owner.trialEnd);
    return { ...owner, periodEnd: periodEndOf(owner.trialEnd, 'monthly') };
  }

  describe('a trial', () => {
    it('is reminded of 3 days before it ends, once, with what the end charges', async () => {
      const { owner, workspaceId, email, trialEnd } = await trialing();
      expect(await subscriptionOf(workspaceId)).toMatchObject({
        nextActionAt: after(trialEnd, -3),
      });
      await runAt(after(trialEnd, -4));
      expect(emailsTo(email, 'billing-trial-ending')).toHaveLength(0);

      await runAt(after(trialEnd, -3));
      await addCard(t, owner, workspaceId, CARD_OK);
      await runAt(after(trialEnd, -2));
      const [reminder, ...more] = emailsTo(email, 'billing-trial-ending');
      expect(more).toHaveLength(0);
      expect(reminder?.data).toMatchObject({
        planName: 'Agency',
        trialEndsOn: '15/11/2026',
        daysLeft: 3,
        // The card was added after the reminder went: it named none.
        charge: null,
      });
      expect(await subscriptionOf(workspaceId)).toMatchObject({ nextActionAt: trialEnd });
    });

    it('with a card, says what its end charges', async () => {
      const { owner, workspaceId, email, trialEnd } = await trialing();
      await addCard(t, owner, workspaceId, CARD_OK);
      await runAt(after(trialEnd, -3));
      expect(emailsTo(email, 'billing-trial-ending').map((sent) => sent.data)).toEqual([
        expect.objectContaining({
          charge: { amount: '599.000 ₫', cycle: 'tháng', card: 'Visa •••• 4242' },
        }),
      ]);
    });

    it('ends read-only without a card: nothing charged, the owner told once', async () => {
      const { owner, workspaceId, email, trialEnd } = await trialing();
      expect(await runAt(trialEnd)).toBe(1);
      await runAt(after(trialEnd, 1));
      const summary = await summaryOf(owner, workspaceId);
      expect(summary).toMatchObject({
        state: 'trial_expired',
        access: 'read_only',
        dueInvoice: null,
        renewal: null,
      });
      expect((await invoicesOf(owner, workspaceId)).items).toEqual([]);
      expect(emailsTo(email, 'billing-read-only').map((sent) => sent.data)).toEqual([
        expect.objectContaining({ reason: 'Thời gian dùng thử đã hết.' }),
      ]);
      expect(await subscriptionOf(workspaceId)).toMatchObject({ nextActionAt: null });
    });

    it('stays read-only when a card is saved after it ended without one, until paid now', async () => {
      const { owner, workspaceId, trialEnd } = await trialing();
      await runAt(after(trialEnd, 1));
      const charge = vi.spyOn(fakeGateway(t), 'charge');
      await addCard(t, owner, workspaceId, CARD_OK);
      expect(await subscriptionOf(workspaceId)).toMatchObject({ cardAfterTrial: true });
      expect(await summaryOf(owner, workspaceId)).toMatchObject({
        state: 'trial_expired',
        access: 'read_only',
        graceEndsAt: null,
        dueInvoice: null,
      });
      const refused = await owner
        .post(`/workspaces/${workspaceId}/sites`, { name: 'Smile', subdomain: uniqueSubdomain() })
        .expect(402);
      expect(problemSchema.parse(refused.body).code).toBe('workspace_read_only');
      // The card is not charged for the trial's end, whenever the job runs.
      await scheduler.runDue();
      await runAt(after(trialEnd, 3));
      expect(charge).not.toHaveBeenCalled();
      expect((await invoicesOf(owner, workspaceId)).items).toEqual([]);

      await owner
        .post(endpoints.changePlan.path(workspaceId), {
          planId: 'agency',
          cycle: 'monthly',
          payNow: true,
          expectedAmount: 599_000,
        })
        .expect(200);
      expect(await summaryOf(owner, workspaceId)).toMatchObject({
        state: 'active',
        access: 'full',
        trialEndsAt: null,
      });
      expect(await subscriptionOf(workspaceId)).toMatchObject({ cardAfterTrial: false });
    });

    it('charges the saved card at its end for the plan chosen, from its end', async () => {
      const { owner, workspaceId, email, trialEnd } = await trialing();
      await owner
        .post(endpoints.changePlan.path(workspaceId), { planId: 'business', cycle: 'monthly' })
        .expect(200);
      await addCard(t, owner, workspaceId, CARD_OK);
      const before = await summaryOf(owner, workspaceId);
      expect(before.renewal).toEqual({
        at: trialEnd.toISOString(),
        planId: 'business',
        planName: 'Doanh nghiệp',
        cycle: 'monthly',
        amount: 1_490_000,
        autoRenews: true,
        blocker: null,
        // Charged to the card at the end, with no invoice before it (T4).
        method: 'card',
        invoiceAt: null,
        invoice: null,
        paid: false,
      });

      await runAt(trialEnd);
      const summary = await summaryOf(owner, workspaceId);
      expect(summary).toMatchObject({
        state: 'active',
        plan: { id: 'business' },
        trialEndsAt: null,
        periodStart: trialEnd.toISOString(),
        periodEnd: periodEndOf(trialEnd, 'monthly').toISOString(),
        dueInvoice: null,
        failedSince: null,
      });
      const [paid] = (await invoicesOf(owner, workspaceId)).items;
      expect(paid).toMatchObject({
        kind: 'subscription',
        status: 'paid',
        amount: 1_490_000,
        periodStart: trialEnd.toISOString(),
        card: { brand: 'visa', last4: '4242' },
      });
      expect(emailsTo(email, 'billing-receipt').map((sent) => sent.data)).toEqual([
        expect.objectContaining({
          invoiceNumber: paid?.number,
          amount: '1.490.000 ₫',
          method: 'Thẻ Visa •••• 4242',
          period: '15/11/2026 – 15/12/2026',
        }),
      ]);
      expect((await logOf(workspaceId)).at(-1)).toBe('paid_plan_started');
      // Its next job is the renewal; the card renews it, so no "Sắp hết hạn".
      expect(await subscriptionOf(workspaceId)).toMatchObject({
        nextActionAt: periodEndOf(trialEnd, 'monthly'),
        lockedUntil: null,
      });
    });

    it('stops at its end after "Hủy gói", without a charge', async () => {
      const { owner, workspaceId, email, trialEnd } = await trialing();
      await addCard(t, owner, workspaceId, CARD_OK);
      const canceled = billingSummarySchema.parse(
        (await owner.post(endpoints.cancelPlan.path(workspaceId)).expect(200)).body,
      );
      expect(canceled).toMatchObject({
        state: 'trialing',
        cancelAt: trialEnd.toISOString(),
        renewal: null,
      });
      await runAt(after(trialEnd, -3));
      expect(emailsTo(email, 'billing-trial-ending')).toHaveLength(0);
      await runAt(trialEnd);
      expect(await summaryOf(owner, workspaceId)).toMatchObject({
        state: 'canceled',
        access: 'read_only',
      });
      expect((await invoicesOf(owner, workspaceId)).items).toEqual([]);
      expect(emailsTo(email, 'billing-read-only')).toHaveLength(1);
    });
  });

  describe('a refused charge', () => {
    it('is retried after 2 and 5 days, then the workspace turns read-only after the grace', async () => {
      const { owner, workspaceId, email, trialEnd } = await paying(CARD_DECLINED);
      const charge = vi.spyOn(fakeGateway(t), 'charge');
      const failedSince = await storedTime(workspaceId, 'failedSince');
      expect(failedSince.getTime() - trialEnd.getTime()).toBeLessThan(MINUTE_MS);

      let summary = await summaryOf(owner, workspaceId);
      expect(summary).toMatchObject({
        state: 'past_due',
        access: 'full',
        trialEndsAt: trialEnd.toISOString(),
        failedSince: failedSince.toISOString(),
        graceEndsAt: after(failedSince, 7).toISOString(),
        nextRetryAt: after(failedSince, 2).toISOString(),
        dueInvoice: {
          status: 'failed',
          payable: true,
          amount: 599_000,
          lastAttempt: { outcome: 'failed', code: 'card_declined' },
        },
      });
      const failed = emailsTo(email, 'billing-charge-failed');
      expect(failed.map((sent) => sent.data)).toEqual([
        expect.objectContaining({
          reason: 'Ngân hàng từ chối thẻ',
          card: 'Visa •••• 0002',
          nextRetryOn: '17/11/2026',
          graceEndsOn: '22/11/2026',
        }),
      ]);

      // Nothing before the first retry.
      await runAt(after(failedSince, 1));
      expect(charge).not.toHaveBeenCalled();
      await runAt(after(failedSince, 2, MINUTE_MS));
      expect(charge).toHaveBeenCalledTimes(1);
      summary = await summaryOf(owner, workspaceId);
      expect(summary.nextRetryAt).toBe(after(failedSince, 5).toISOString());

      // A job that runs late makes one charge for what it missed.
      await runAt(after(failedSince, 6));
      expect(charge).toHaveBeenCalledTimes(2);
      summary = await summaryOf(owner, workspaceId);
      expect(summary).toMatchObject({ state: 'past_due', access: 'full', nextRetryAt: null });
      expect(emailsTo(email, 'billing-charge-failed').at(-1)?.data).toMatchObject({
        nextRetryOn: null,
      });

      await runAt(after(failedSince, 7, MINUTE_MS));
      await runAt(after(failedSince, 9));
      expect(charge).toHaveBeenCalledTimes(2);
      expect(await summaryOf(owner, workspaceId)).toMatchObject({
        state: 'past_due',
        access: 'read_only',
      });
      expect(emailsTo(email, 'billing-read-only').map((sent) => sent.data)).toEqual([
        expect.objectContaining({
          reason: 'Gói chưa được thanh toán và đã hết thời gian ân hạn.',
        }),
      ]);
      expect(await subscriptionOf(workspaceId)).toMatchObject({ nextActionAt: null });

      // Read-only refuses work, never payments.
      const plan = workspacePlanSchema.parse(
        (await owner.get(endpoints.getWorkspacePlan.path(workspaceId)).expect(200)).body,
      );
      expect(plan.access).toBe('read_only');
    });

    it('is paid again with a new card: the plan is active, its period from the old end', async () => {
      const { owner, workspaceId, email, trialEnd } = await paying(CARD_NO_FUNDS);
      await runAt(after(trialEnd, 8));
      const { dueInvoice } = await summaryOf(owner, workspaceId);
      expect(dueInvoice?.lastAttempt?.code).toBe('insufficient_funds');
      await addCard(t, owner, workspaceId, CARD_OK);
      const paid = payInvoiceResponseSchema.parse(
        (await payInvoice(owner, workspaceId, dueInvoice?.id ?? '').expect(200)).body,
      );
      expect(paid.invoice).toMatchObject({ status: 'paid', payable: false });
      expect(await summaryOf(owner, workspaceId)).toMatchObject({
        state: 'active',
        access: 'full',
        periodStart: trialEnd.toISOString(),
        periodEnd: periodEndOf(trialEnd, 'monthly').toISOString(),
        failedSince: null,
        dueInvoice: null,
      });
      expect(emailsTo(email, 'billing-receipt')).toHaveLength(1);
      expect(await subscriptionOf(workspaceId)).toMatchObject({
        nextActionAt: periodEndOf(trialEnd, 'monthly'),
      });
    });
  });

  describe('a paid period', () => {
    it('renews at its end with the saved card, from its end', async () => {
      const { owner, workspaceId, email, periodEnd } = await paying();
      expect(await runAt(after(periodEnd, -1))).toBe(0);
      await runAt(periodEnd);
      const summary = await summaryOf(owner, workspaceId);
      expect(summary).toMatchObject({
        state: 'active',
        periodStart: periodEnd.toISOString(),
        periodEnd: periodEndOf(periodEnd, 'monthly').toISOString(),
      });
      const [renewal] = (await invoicesOf(owner, workspaceId)).items;
      expect(renewal).toMatchObject({ kind: 'subscription', status: 'paid', amount: 599_000 });
      expect(emailsTo(email, 'billing-receipt')).toHaveLength(2);
      expect((await logOf(workspaceId)).at(-1)).toBe('period_renewed');
    });

    it('cannot renew with a card that expires first: "Sắp hết hạn", then overdue', async () => {
      const { owner, workspaceId, email, periodEnd } = await paying();
      // A card that works until the end of November 2026, before the period ends on 15/12.
      await addCard(t, owner, workspaceId, CARD_OK, { expMonth: 11, expYear: 2026 });
      expect(await subscriptionOf(workspaceId)).toMatchObject({
        nextActionAt: after(periodEnd, -7),
      });
      clock.set(after(periodEnd, -10));
      expect((await summaryOf(owner, workspaceId)).renewal).toMatchObject({
        autoRenews: false,
        blocker: 'card_expires',
      });
      await runAt(after(periodEnd, -7));
      expect(emailsTo(email, 'billing-expiring-soon').map((sent) => sent.data)).toEqual([
        expect.objectContaining({
          periodEndsOn: '15/12/2026',
          daysLeft: 7,
          reason: 'Thẻ Visa •••• 4242 hết hạn 11/2026, trước ngày gia hạn',
        }),
      ]);
      expect(await summaryOf(owner, workspaceId)).toMatchObject({ state: 'expiring_soon' });

      const charge = vi.spyOn(fakeGateway(t), 'charge');
      await runAt(periodEnd);
      expect(charge).not.toHaveBeenCalled();
      const summary = await summaryOf(owner, workspaceId);
      expect(summary).toMatchObject({
        state: 'past_due',
        dueInvoice: { status: 'failed', lastAttempt: { code: 'expired_card' } },
      });
      expect(summary.failedSince).not.toBeNull();
      // Board 28 shows the due invoice to Quản trị too: without the card, which is board 29's.
      expect(summary.dueInvoice).not.toHaveProperty('card');
      expect(emailsTo(email, 'billing-charge-failed').at(-1)?.data).toMatchObject({
        reason: 'Thẻ đã hết hạn',
        card: null,
      });

      // A new card pays the renewal: the next period runs from the end of the old one.
      clock.set(after(periodEnd, 3));
      await addCard(t, owner, workspaceId, CARD_OK);
      await payInvoice(owner, workspaceId, summary.dueInvoice?.id ?? '').expect(200);
      expect(await summaryOf(owner, workspaceId)).toMatchObject({
        state: 'active',
        periodStart: periodEnd.toISOString(),
        periodEnd: periodEndOf(periodEnd, 'monthly').toISOString(),
        failedSince: null,
        dueInvoice: null,
      });
      expect((await logOf(workspaceId)).at(-1)).toBe('period_renewed');
    });

    it('applies a downgrade scheduled for its end with the renewal, and what the plan stops', async () => {
      const { owner, workspaceId, periodEnd, trialEnd } = await paying();
      clock.set(after(trialEnd, 10));
      await owner
        .post(endpoints.changePlan.path(workspaceId), { planId: 'basic', cycle: 'yearly' })
        .expect(200);
      expect((await summaryOf(owner, workspaceId)).renewal).toMatchObject({
        at: periodEnd.toISOString(),
        planId: 'basic',
        cycle: 'yearly',
        amount: 1_990_000,
      });
      await runAt(periodEnd);
      expect(await summaryOf(owner, workspaceId)).toMatchObject({
        state: 'active',
        plan: { id: 'basic' },
        cycle: 'yearly',
        scheduledChange: null,
        periodStart: periodEnd.toISOString(),
        periodEnd: periodEndOf(periodEnd, 'yearly').toISOString(),
      });
      expect(toldOf(workspaceId).at(-1)).toEqual(['agency', 'basic']);
      expect((await logOf(workspaceId)).slice(-3)).toEqual([
        'change_scheduled',
        'period_renewed',
        'scheduled_change_applied',
      ]);
    });

    it('stops at its end after "Hủy gói"; "Giữ lại gói" before it keeps it', async () => {
      const { owner, workspaceId, email, periodEnd, trialEnd } = await paying();
      clock.set(after(trialEnd, 3));
      await owner.post(endpoints.cancelPlan.path(workspaceId)).expect(200);
      expect(await summaryOf(owner, workspaceId)).toMatchObject({
        state: 'cancel_scheduled',
        cancelAt: periodEnd.toISOString(),
        renewal: null,
      });
      await owner.post(endpoints.keepPlan.path(workspaceId)).expect(200);
      expect(await summaryOf(owner, workspaceId)).toMatchObject({
        state: 'active',
        cancelAt: null,
      });
      await owner.post(endpoints.cancelPlan.path(workspaceId)).expect(200);
      // Twice is once.
      await owner.post(endpoints.cancelPlan.path(workspaceId)).expect(200);

      const charge = vi.spyOn(fakeGateway(t), 'charge');
      await runAt(periodEnd);
      expect(charge).not.toHaveBeenCalled();
      expect(await summaryOf(owner, workspaceId)).toMatchObject({
        state: 'canceled',
        access: 'read_only',
        cancelAt: periodEnd.toISOString(),
      });
      expect(emailsTo(email, 'billing-read-only').at(-1)?.data).toMatchObject({
        reason: 'Gói đã hủy.',
      });
      const late = await owner.post(endpoints.keepPlan.path(workspaceId)).expect(409);
      expect(problemSchema.parse(late.body)).toMatchObject({
        code: 'plan_change_unavailable',
        context: { reason: 'payment_required' },
      });
      expect((await logOf(workspaceId)).slice(-3)).toEqual([
        'cancel_scheduled',
        'cancel_withdrawn',
        'cancel_scheduled',
      ]);

      // "Chọn gói mới": paid now from now, no second trial.
      clock.set(after(periodEnd, 2));
      const choice = await owner
        .post(endpoints.changePlan.path(workspaceId), { planId: 'business', cycle: 'monthly' })
        .expect(409);
      expect(problemSchema.parse(choice.body).context).toEqual({ reason: 'payment_required' });
      await owner
        .post(endpoints.changePlan.path(workspaceId), {
          planId: 'business',
          cycle: 'monthly',
          payNow: true,
          expectedAmount: 1_490_000,
        })
        .expect(200);
      const restarted = await summaryOf(owner, workspaceId);
      expect(restarted).toMatchObject({
        state: 'active',
        plan: { id: 'business' },
        trialEndsAt: null,
        cancelAt: null,
      });
      expect(new Date(restarted.periodStart).getTime()).toBeGreaterThanOrEqual(
        after(periodEnd, 2).getTime(),
      );
      expect((await logOf(workspaceId)).at(-1)).toBe('plan_restarted');
    });

    it('keeps a downgrade through "Hủy gói" for "Giữ lại gói", and has none once the plan stopped', async () => {
      const { owner, workspaceId, periodEnd, trialEnd } = await paying();
      const downgrade = { planId: 'basic', cycle: 'monthly' } as const;
      clock.set(after(trialEnd, 10));
      await owner.post(endpoints.changePlan.path(workspaceId), downgrade).expect(200);
      await owner.post(endpoints.cancelPlan.path(workspaceId)).expect(200);
      // No renewal follows "Hủy gói", so the change cannot apply while it stands; it stays stored.
      expect(await summaryOf(owner, workspaceId)).toMatchObject({
        state: 'cancel_scheduled',
        cancelAt: periodEnd.toISOString(),
        scheduledChange: downgrade,
        renewal: null,
      });

      // "Giữ lại gói" brings back the renewal the owner chose, on the scheduled plan.
      await owner.post(endpoints.keepPlan.path(workspaceId)).expect(200);
      expect(await summaryOf(owner, workspaceId)).toMatchObject({
        state: 'active',
        cancelAt: null,
        scheduledChange: downgrade,
        renewal: {
          at: periodEnd.toISOString(),
          planId: 'basic',
          cycle: 'monthly',
          amount: 199_000,
        },
      });

      // Canceled again: the plan stops with no charge, and the change has nothing left to apply to.
      await owner.post(endpoints.cancelPlan.path(workspaceId)).expect(200);
      const charge = vi.spyOn(fakeGateway(t), 'charge');
      await runAt(periodEnd);
      expect(charge).not.toHaveBeenCalled();
      expect(await summaryOf(owner, workspaceId)).toMatchObject({
        state: 'canceled',
        plan: { id: 'agency' },
        scheduledChange: null,
        renewal: null,
      });
      await owner.delete(endpoints.cancelScheduledChange.path(workspaceId)).expect(200);
      expect((await logOf(workspaceId)).slice(-4)).toEqual([
        'change_scheduled',
        'cancel_scheduled',
        'cancel_withdrawn',
        'cancel_scheduled',
      ]);
    });

    it('starts a fresh period when its renewal is paid after that period ended, with one charge', async () => {
      const { owner, workspaceId, email, periodEnd } = await paying();
      await addCard(t, owner, workspaceId, CARD_DECLINED);
      await runAt(periodEnd);
      await runAt(after(periodEnd, 9));
      const { dueInvoice, access } = await summaryOf(owner, workspaceId);
      expect(access).toBe('read_only');
      expect(await subscriptionOf(workspaceId)).toMatchObject({ nextActionAt: null });
      const invoiceId = dueInvoice?.id ?? '';

      // "Thanh toán lại" 45 days late: the period it was made for, from the old end, is over.
      expect(after(periodEnd, 45).getTime()).toBeGreaterThan(
        periodEndOf(periodEnd, 'monthly').getTime(),
      );
      clock.set(after(periodEnd, 45));
      await addCard(t, owner, workspaceId, CARD_OK);
      const charge = vi.spyOn(fakeGateway(t), 'charge');
      await payInvoice(owner, workspaceId, invoiceId).expect(200);
      const { period, paidAt } = await paidPeriodOf(owner, workspaceId, invoiceId);
      expect(period.start).toEqual(paidAt);
      expect(period.end).toEqual(periodEndOf(paidAt, 'monthly'));
      await expectFreshPeriod(owner, workspaceId, period);
      expect(emailsTo(email, 'billing-receipt').at(-1)?.data).toMatchObject({
        period: `${vnDateText(period.start)} – ${vnDateText(period.end)}`,
      });

      // The job has nothing to do before the new period ends: no charge for a cycle missed.
      expect(await scheduler.runDue()).toBe(0);
      await runAt(after(period.end, -1));
      expect(charge).toHaveBeenCalledTimes(1);
      expect((await invoicesOf(owner, workspaceId)).items).toHaveLength(2);
      expect(await summaryOf(owner, workspaceId)).toMatchObject({
        state: 'active',
        periodStart: period.start.toISOString(),
      });
    });

    it('starts a fresh period when a transfer for its renewal arrives after that period ended', async () => {
      const { owner, workspaceId, periodEnd } = await paying();
      await addCard(t, owner, workspaceId, CARD_DECLINED);
      await runAt(periodEnd);
      const { dueInvoice } = await summaryOf(owner, workspaceId);
      const invoiceId = dueInvoice?.id ?? '';
      const started = startTransferResponseSchema.parse(
        (await owner.post(endpoints.startInvoiceTransfer.path(workspaceId, invoiceId)).expect(200))
          .body,
      );
      await runAt(after(periodEnd, 9));
      expect((await summaryOf(owner, workspaceId)).access).toBe('read_only');

      const charge = vi.spyOn(fakeGateway(t), 'charge');
      clock.set(after(periodEnd, 45));
      await postGatewayEvent(t, {
        kind: 'transfer_received',
        eventId: newEventId(),
        occurredAt: new Date().toISOString(),
        reference: invoiceId,
        amount: started.invoice.amount,
      }).expect(200);
      const { period, paidAt } = await paidPeriodOf(owner, workspaceId, invoiceId);
      expect(period.start).toEqual(paidAt);
      expect(period.end).toEqual(periodEndOf(paidAt, 'monthly'));
      await expectFreshPeriod(owner, workspaceId, period);

      expect(await scheduler.runDue()).toBe(0);
      await runAt(after(period.end, -1));
      expect(charge).not.toHaveBeenCalled();
      expect((await invoicesOf(owner, workspaceId)).items).toHaveLength(2);
    });

    it('keeps a downgrade scheduled for its end once the renewal charges it, unpaid', async () => {
      const { owner, workspaceId, periodEnd, trialEnd } = await paying();
      clock.set(after(trialEnd, 10));
      await owner
        .post(endpoints.changePlan.path(workspaceId), { planId: 'basic', cycle: 'monthly' })
        .expect(200);
      await addCard(t, owner, workspaceId, CARD_DECLINED);
      await runAt(periodEnd);
      const unpaid = await summaryOf(owner, workspaceId);
      expect(unpaid).toMatchObject({
        state: 'past_due',
        dueInvoice: { planId: 'basic', amount: 199_000 },
      });

      const refused = await owner
        .delete(endpoints.cancelScheduledChange.path(workspaceId))
        .expect(409);
      expect(problemSchema.parse(refused.body)).toMatchObject({
        code: 'plan_change_unavailable',
        context: { reason: 'unpaid' },
      });
      expect(await summaryOf(owner, workspaceId)).toMatchObject({
        scheduledChange: { planId: 'basic', cycle: 'monthly' },
      });
      expect(await logOf(workspaceId)).not.toContain('scheduled_change_canceled');

      // Paying the renewal applies the plan it charged, as the log says.
      await addCard(t, owner, workspaceId, CARD_OK);
      await payInvoice(owner, workspaceId, unpaid.dueInvoice?.id ?? '').expect(200);
      expect(await summaryOf(owner, workspaceId)).toMatchObject({
        state: 'active',
        plan: { id: 'basic' },
        scheduledChange: null,
      });
      expect((await logOf(workspaceId)).slice(-2)).toEqual([
        'period_renewed',
        'scheduled_change_applied',
      ]);
    });

    it('cannot be canceled while its renewal is unpaid', async () => {
      const { owner, workspaceId } = await paying(CARD_DECLINED);
      const refused = await owner.post(endpoints.cancelPlan.path(workspaceId)).expect(409);
      expect(problemSchema.parse(refused.body).context).toEqual({ reason: 'unpaid' });
    });
  });

  describe('a charge whose outcome is unknown', () => {
    it('leaves the renewal waiting, and the job asks the gateway again with the same key', async () => {
      const { owner, workspaceId, periodEnd } = await paying();
      const charge = vi
        .spyOn(fakeGateway(t), 'charge')
        .mockRejectedValueOnce(new Error('socket hang up'));
      await runAt(periodEnd);
      const waiting = await summaryOf(owner, workspaceId);
      expect(waiting).toMatchObject({
        state: 'pending_payment',
        access: 'full',
        dueInvoice: { status: 'open', lastAttempt: { outcome: 'unknown' } },
      });
      const invoiceId = waiting.dueInvoice?.id ?? '';
      const askedAt = await storedTime(workspaceId, 'nextActionAt');
      expect(askedAt.getTime()).toBeGreaterThan(periodEnd.getTime() + 15 * MINUTE_MS - 1);
      expect(askedAt.getTime()).toBeLessThan(periodEnd.getTime() + 16 * MINUTE_MS);

      await runAt(askedAt);
      expect(charge.mock.calls.map(([request]) => request.idempotencyKey)).toEqual([
        `${invoiceId}-1`,
        `${invoiceId}-1`,
      ]);
      expect(await summaryOf(owner, workspaceId)).toMatchObject({
        state: 'active',
        periodStart: periodEnd.toISOString(),
      });
    });

    it('voids a plan change still unknown once its period ended, without asking with its key', async () => {
      const { owner, workspaceId, periodEnd, trialEnd } = await paying();
      clock.set(after(trialEnd, 18, MINUTE_MS));
      const charge = vi
        .spyOn(fakeGateway(t), 'charge')
        .mockRejectedValue(new Error('socket hang up'));
      const unknown = await owner
        .post(endpoints.changePlan.path(workspaceId), {
          planId: 'business',
          cycle: 'monthly',
          expectedAmount: 357_000,
        })
        .expect(503);
      const invoiceId = String(problemSchema.parse(unknown.body).context?.['invoiceId']);

      // First asked about at the period's end, when the upgrade no longer applies: a question with
      // its key could make the charge now, if the first never reached the gateway. It is voided
      // without one, logged for a check at the gateway, and the renewal goes on.
      charge.mockRestore();
      const later = vi
        .spyOn(fakeGateway(t), 'charge')
        .mockImplementation((request) =>
          request.idempotencyKey.startsWith(invoiceId)
            ? Promise.reject(new Error('socket hang up'))
            : Promise.resolve({ status: 'succeeded' }),
        );
      const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      await runAt(periodEnd);
      const upgrade = invoiceSchema.parse(
        (await owner.get(endpoints.getInvoice.path(workspaceId, invoiceId)).expect(200)).body,
      );
      expect(upgrade).toMatchObject({ status: 'void', payable: false });
      expect(
        later.mock.calls.filter(([request]) => request.idempotencyKey.startsWith(invoiceId)),
      ).toEqual([]);
      expect(logged).toHaveBeenCalledWith(
        expect.objectContaining({ invoiceId }),
        expect.stringContaining('refund it outside the system'),
      );
      expect(await summaryOf(owner, workspaceId)).toMatchObject({
        state: 'active',
        plan: { id: 'agency' },
        periodStart: periodEnd.toISOString(),
      });
    });
  });

  describe('one round of the job', () => {
    it('holds each subscription from when its own run starts, however long the runs before took', async () => {
      const first = await paying();
      const second = await paying();
      const due = new Date(Math.max(first.periodEnd.getTime(), second.periodEnd.getTime()));
      const held: boolean[] = [];
      vi.spyOn(fakeGateway(t), 'charge').mockImplementation(async (request) => {
        const invoice = await t.connection
          .collection('invoices')
          .findOne({ _id: new Types.ObjectId(request.reference) });
        const subscription = await t.connection
          .collection('subscriptions')
          .findOne({ _id: invoice?.['workspaceId'] as Types.ObjectId });
        const lockedUntil: unknown = subscription?.['lockedUntil'];
        held.push(lockedUntil instanceof Date && lockedUntil > clock.now());
        // A gateway that takes 3 minutes to answer the first charge of the round.
        clock.set(new Date(clock.now().getTime() + 3 * MINUTE_MS));
        return { status: 'succeeded' };
      });
      expect(await runAt(due)).toBe(2);
      expect(held).toEqual([true, true]);
    });
  });

  describe('two instances', () => {
    it('charge a due renewal once', async () => {
      const second = await createSecondInstance(t);
      try {
        const { owner, workspaceId, periodEnd } = await paying();
        const charges = [
          vi.spyOn(fakeGateway(t), 'charge'),
          vi.spyOn(fakeGateway(second), 'charge'),
        ];
        clock.set(periodEnd);
        second.app.get(BillingClock).set(periodEnd);
        await Promise.all([scheduler.runDue(), second.app.get(BillingScheduler).runDue()]);
        expect(charges.reduce((sum, spy) => sum + spy.mock.calls.length, 0)).toBe(1);
        const renewals = (await invoicesOf(owner, workspaceId)).items.filter(
          (item) => item.periodStart === periodEnd.toISOString(),
        );
        expect(renewals.map((item) => item.status)).toEqual(['paid']);
      } finally {
        second.app.get(BillingClock).set(null);
        await second.close();
      }
    });
  });

  describe('the emails of the plan', () => {
    it('go once each, however many runs see them due', async () => {
      const { workspaceId, email, trialEnd } = await paying(CARD_DECLINED);
      await runAt(after(trialEnd, 1));
      await scheduler.runDue();
      await runAt(after(trialEnd, 8));
      await runAt(after(trialEnd, 8, MINUTE_MS));
      expect(emailsTo(email, 'billing-read-only')).toHaveLength(1);
      // The job ran first at the trial's end: its reminder was no longer due.
      expect(emailsTo(email, 'billing-trial-ending')).toHaveLength(0);
      expect(emailsTo(email, 'billing-charge-failed')).toHaveLength(2);
      const keys = t.emails.sent
        .filter((sent) => sent.to.includes(email) && sent.template.startsWith('billing-'))
        .map((sent) => sent.idempotencyKey);
      expect(new Set(keys).size).toBe(keys.length);
      expect(
        await t.connection
          .collection('billing_notices')
          .countDocuments({ workspaceId: new Types.ObjectId(workspaceId) }),
      ).toBe(keys.length);
    });

    it('that failed to send are sent by a later run while still due', async () => {
      const { workspaceId, email, trialEnd } = await trialing();
      t.emails.failNext('smtp_unavailable');
      await runAt(after(trialEnd, -3));
      expect(emailsTo(email, 'billing-trial-ending')).toHaveLength(0);
      const retryAt = await storedTime(workspaceId, 'nextActionAt');
      expect(retryAt.getTime() - after(trialEnd, -3).getTime()).toBeGreaterThanOrEqual(
        15 * MINUTE_MS,
      );
      expect(retryAt.getTime() - after(trialEnd, -3).getTime()).toBeLessThan(16 * MINUTE_MS);
      await runAt(retryAt);
      expect(emailsTo(email, 'billing-trial-ending')).toHaveLength(1);
    });
  });
});
