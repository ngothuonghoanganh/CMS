import {
  type BillingSummary,
  billingSummarySchema,
  endpoints,
  invoiceSchema,
  payInvoiceResponseSchema,
  problemSchema,
  workspacePlanSchema,
} from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import { createSecondInstance } from '../../../test/instances.js';
import {
  addCard,
  CARD_DECLINED,
  CARD_NO_FUNDS,
  CARD_OK,
  fakeGateway,
  invoicesOf,
  payInvoice,
} from '../../../test/payments.js';
import { BUNDLED_PLAN_CATALOG_FILE } from '../../config/env.js';
import { BillingClock } from './billing-clock.js';
import { BillingScheduler } from './billing-scheduler.service.js';
import { periodEndOf } from './domain/billing-period.js';
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

    it('voids a plan change still unknown once its period ended, so it never charges twice', async () => {
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

      // Still unknown when asked at the period's end: voided, and the renewal goes on.
      charge.mockRestore();
      const stillUnknown = vi
        .spyOn(fakeGateway(t), 'charge')
        .mockImplementation((request) =>
          request.idempotencyKey.startsWith(invoiceId)
            ? Promise.reject(new Error('socket hang up'))
            : Promise.resolve({ status: 'succeeded' }),
        );
      await runAt(periodEnd);
      const upgrade = invoiceSchema.parse(
        (await owner.get(endpoints.getInvoice.path(workspaceId, invoiceId)).expect(200)).body,
      );
      expect(upgrade).toMatchObject({ status: 'void', payable: false });
      expect(
        stillUnknown.mock.calls.filter(([request]) => request.idempotencyKey === `${invoiceId}-1`)
          .length,
      ).toBeGreaterThanOrEqual(1);
      expect(
        stillUnknown.mock.calls.every(
          ([request]) =>
            !request.idempotencyKey.startsWith(invoiceId) ||
            request.idempotencyKey === `${invoiceId}-1`,
        ),
      ).toBe(true);
      expect(await summaryOf(owner, workspaceId)).toMatchObject({
        state: 'active',
        plan: { id: 'agency' },
        periodStart: periodEnd.toISOString(),
      });
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
