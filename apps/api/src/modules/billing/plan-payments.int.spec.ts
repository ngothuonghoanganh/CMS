import {
  type BillingSummary,
  billingSummarySchema,
  endpoints,
  type GatewayEvent,
  type Invoice,
  invoiceReceiptSchema,
  invoiceSchema,
  payInvoiceResponseSchema,
  type PlanChangeQuote,
  planChangeQuoteSchema,
  problemSchema,
} from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
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
import { createSite } from '../../../test/resources.js';
import { BUNDLED_PLAN_CATALOG_FILE } from '../../config/env.js';
import { BillingClock } from './billing-clock.js';
import { periodEndOf } from './domain/billing-period.js';
import { InvoicesRepository } from './invoices.repository.js';
import { type PlanChange, PlanChangeHooks } from './plan-change-hooks.js';

const DAY_MS = 86_400_000;
/** 10:00 on 01/11/2026 in Vietnam: a monthly period from it has 30 days. */
const START = new Date('2026-11-01T03:00:00.000Z');
const at = (days: number) => new Date(START.getTime() + days * DAY_MS);

describe('paying for plans (ADR-035, T2)', () => {
  let t: TestApp;
  let clock: BillingClock;
  const changes: Array<{ workspaceId: string; change: PlanChange }> = [];
  let failHook = false;

  beforeAll(async () => {
    t = await createTestApp('plp_test_plan_payments', {
      env: { BILLING_TEST_CLOCK: 'on', PLAN_CATALOG_FILE: BUNDLED_PLAN_CATALOG_FILE },
    });
    clock = t.app.get(BillingClock);
    t.app.get(PlanChangeHooks).register((ref, change) => {
      if (failHook) {
        failHook = false;
        return Promise.reject(new Error('Pausing the automations failed'));
      }
      changes.push({ workspaceId: ref.workspaceId.toHexString(), change });
      return Promise.resolve();
    });
  });

  afterEach(() => {
    clock.set(null);
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await t.close();
  });

  const subscriptionOf = (workspaceId: string) =>
    t.connection.collection('subscriptions').findOne({ _id: new Types.ObjectId(workspaceId) });
  const logOf = (workspaceId: string) =>
    t.connection
      .collection('billing_log')
      .find({ workspaceId: new Types.ObjectId(workspaceId) })
      .sort({ _id: 1 })
      .toArray();
  const toldOf = (workspaceId: string) =>
    changes
      .filter((item) => item.workspaceId === workspaceId)
      .map(({ change }) => [change.from.id, change.to.id]);

  /** A new owner on a trial that started at START (the billing clock stays there). */
  async function trialing(): Promise<{ owner: TestClient; workspaceId: string; ownerId: string }> {
    clock.set(START);
    const { client, workspaceId, me } = await signedUpClient(t.app);
    return { owner: client, workspaceId, ownerId: me.user.id };
  }

  async function quote(
    owner: TestClient,
    workspaceId: string,
    query: { planId: string; cycle: 'monthly' | 'yearly'; payNow?: boolean },
  ): Promise<PlanChangeQuote> {
    const response = await owner
      .get(endpoints.getPlanChangeQuote.path(workspaceId))
      .query({ ...query, payNow: String(query.payNow ?? false) })
      .expect(200);
    return planChangeQuoteSchema.parse(response.body);
  }

  function choose(
    owner: TestClient,
    workspaceId: string,
    body: {
      planId: string;
      cycle: 'monthly' | 'yearly';
      payNow?: boolean;
      expectedAmount?: number;
    },
  ) {
    return owner.post(endpoints.changePlan.path(workspaceId), body);
  }

  function summaryOf(response: { body: unknown }): BillingSummary {
    return billingSummarySchema.parse(response.body);
  }

  async function invoice(owner: TestClient, workspaceId: string, id: string): Promise<Invoice> {
    return invoiceSchema.parse(
      (await owner.get(endpoints.getInvoice.path(workspaceId, id)).expect(200)).body,
    );
  }

  /** A paid monthly period of Gói Agency from about START (30 days), with a card that pays. */
  async function paying(): Promise<{
    owner: TestClient;
    workspaceId: string;
    ownerId: string;
    periodStart: Date;
    periodEnd: Date;
  }> {
    const owner = await trialing();
    await addCard(t, owner.owner, owner.workspaceId, CARD_OK);
    await choose(owner.owner, owner.workspaceId, {
      planId: 'agency',
      cycle: 'monthly',
      payNow: true,
      expectedAmount: 599_000,
    }).expect(200);
    const stored = await subscriptionOf(owner.workspaceId);
    return {
      ...owner,
      periodStart: stored?.['periodStart'] as Date,
      periodEnd: stored?.['periodEnd'] as Date,
    };
  }

  /**
   * Moves the billing clock a minute past `days` into the paid period: the period started when
   * its charge ran, so whole days left stay exact (30 − days) however long the test took.
   */
  function intoPeriod(paid: { periodStart: Date }, days: number): Date {
    const moved = new Date(paid.periodStart.getTime() + days * DAY_MS + 60_000);
    clock.set(moved);
    return moved;
  }

  describe('during the trial', () => {
    it('quotes a free change, or the first period paid now', async () => {
      const { owner, workspaceId } = await trialing();
      expect(await quote(owner, workspaceId, { planId: 'basic', cycle: 'monthly' })).toEqual({
        mode: 'trial_change',
        planId: 'basic',
        cycle: 'monthly',
        amount: 0,
        periodStart: null,
        periodEnd: null,
        remainingDays: null,
        periodDays: null,
        paymentMethod: null,
        paymentMethodRequired: false,
        unavailableReason: null,
      });
      const paidNow = await quote(owner, workspaceId, {
        planId: 'business',
        cycle: 'monthly',
        payNow: true,
      });
      expect(paidNow).toMatchObject({
        mode: 'start_paid',
        amount: 1_490_000,
        paymentMethodRequired: true,
      });
      // A whole month from now (the billing clock runs on from START).
      const periodStart = new Date(paidNow.periodStart ?? '');
      expect(periodStart.getTime()).toBeGreaterThanOrEqual(START.getTime());
      expect(paidNow.periodEnd).toBe(periodEndOf(periodStart, 'monthly').toISOString());
      expect(
        (await quote(owner, workspaceId, { planId: 'business', cycle: 'yearly', payNow: true }))
          .amount,
      ).toBe(14_900_000);
    });

    it('pays now with the saved card: the trial ends and the plan is paid for a period', async () => {
      const { owner, workspaceId, ownerId } = await trialing();
      // As in §5 step 2: a free change to Gói Cơ bản first.
      await choose(owner, workspaceId, { planId: 'basic', cycle: 'monthly' }).expect(200);
      await choose(owner, workspaceId, {
        planId: 'business',
        cycle: 'monthly',
        payNow: true,
        expectedAmount: 1_490_000,
      }).expect(422);
      await addCard(t, owner, workspaceId, CARD_OK);
      expect(
        await quote(owner, workspaceId, { planId: 'business', cycle: 'monthly', payNow: true }),
      ).toMatchObject({
        paymentMethod: { brand: 'visa', last4: '4242', expired: false },
        paymentMethodRequired: false,
      });

      clock.set(at(2));
      const summary = summaryOf(
        await choose(owner, workspaceId, {
          planId: 'business',
          cycle: 'monthly',
          payNow: true,
          expectedAmount: 1_490_000,
        }).expect(200),
      );
      expect(summary).toMatchObject({
        plan: { id: 'business' },
        cycle: 'monthly',
        state: 'active',
        access: 'full',
        trialEndsAt: null,
        trialDaysLeft: null,
      });
      expect(Date.parse(summary.periodStart)).toBeGreaterThanOrEqual(at(2).getTime());
      expect(Date.parse(summary.periodEnd)).toBe(
        periodEndOf(new Date(summary.periodStart), 'monthly').getTime(),
      );

      const { items, nextCursor } = await invoicesOf(owner, workspaceId);
      expect(nextCursor).toBeNull();
      expect(items).toHaveLength(1);
      const paid = items[0];
      expect(paid).toMatchObject({
        kind: 'subscription',
        planId: 'business',
        planName: 'Doanh nghiệp',
        cycle: 'monthly',
        amount: 1_490_000,
        method: 'card',
        card: { brand: 'visa', last4: '4242' },
        status: 'paid',
        payable: false,
        lastAttempt: { number: 1, outcome: 'succeeded', code: null },
        periodStart: summary.periodStart,
        periodEnd: summary.periodEnd,
      });
      expect(paid?.number).toMatch(/^HD-2026-\d{6}$/);

      const receipt = invoiceReceiptSchema.parse(
        (await owner.get(endpoints.getInvoiceReceipt.path(workspaceId, paid?.id ?? '')).expect(200))
          .body,
      );
      expect(receipt.invoice).toMatchObject({ id: paid?.id, status: 'paid', endsTrial: true });
      expect(receipt.workspaceName).toMatch(/^Workspace /);

      const log = await logOf(workspaceId);
      expect(log.map((entry) => entry['action'] as string)).toEqual([
        'plan_changed',
        'payment_method_changed',
        'paid_plan_started',
      ]);
      expect(log[2]).toMatchObject({
        actorId: new Types.ObjectId(ownerId),
        from: { planId: 'basic', cycle: 'monthly' },
        to: { planId: 'business', cycle: 'monthly' },
        invoiceId: new Types.ObjectId(paid?.id),
        amount: 1_490_000,
      });
      expect(toldOf(workspaceId)).toEqual([
        ['agency', 'basic'],
        ['basic', 'business'],
      ]);
      expect(await subscriptionOf(workspaceId)).toMatchObject({
        planId: 'business',
        trialEndsAt: null,
        lockedUntil: null,
        nextActionAt: new Date(summary.periodEnd),
      });
    });

    it('asks to confirm the amount of the quote', async () => {
      const { owner, workspaceId } = await trialing();
      await addCard(t, owner, workspaceId);
      const missing = await choose(owner, workspaceId, {
        planId: 'business',
        cycle: 'monthly',
        payNow: true,
      }).expect(422);
      expect(problemSchema.parse(missing.body).issues?.[0]?.path).toEqual(['expectedAmount']);
      const changed = await choose(owner, workspaceId, {
        planId: 'business',
        cycle: 'monthly',
        payNow: true,
        expectedAmount: 599_000,
      }).expect(409);
      expect(problemSchema.parse(changed.body)).toMatchObject({
        code: 'quote_changed',
        context: { quote: { mode: 'start_paid', amount: 1_490_000 } },
      });
      expect(await invoicesOf(owner, workspaceId)).toEqual({ items: [], nextCursor: null });
    });

    it('only takes payment once the trial is over, and a payment ends read-only', async () => {
      const { owner, workspaceId } = await trialing();
      clock.set(at(15));
      await owner
        .post(endpoints.createSite.path(workspaceId), { name: 'Spa Lá Xanh', subdomain: 'spa-t2' })
        .expect(402);
      const refused = await choose(owner, workspaceId, {
        planId: 'basic',
        cycle: 'monthly',
      }).expect(409);
      expect(problemSchema.parse(refused.body)).toMatchObject({
        code: 'plan_change_unavailable',
        context: { reason: 'payment_required' },
      });
      await addCard(t, owner, workspaceId);
      await choose(owner, workspaceId, {
        planId: 'basic',
        cycle: 'yearly',
        payNow: true,
        expectedAmount: 1_990_000,
      }).expect(200);
      const summary = billingSummarySchema.parse(
        (await owner.get(endpoints.getBillingSummary.path(workspaceId)).expect(200)).body,
      );
      expect(summary).toMatchObject({ plan: { id: 'basic' }, cycle: 'yearly', state: 'active' });
      await createSite(owner, workspaceId);
    });
  });

  describe('a refused charge', () => {
    it('changes nothing but its invoice, which says why', async () => {
      const { owner, workspaceId } = await trialing();
      await addCard(t, owner, workspaceId, CARD_DECLINED);
      const before = await subscriptionOf(workspaceId);
      const refused = await choose(owner, workspaceId, {
        planId: 'business',
        cycle: 'monthly',
        payNow: true,
        expectedAmount: 1_490_000,
      }).expect(402);
      const problem = problemSchema.parse(refused.body);
      expect(problem).toMatchObject({
        code: 'payment_failed',
        title: 'Thanh toán không thành công',
        context: { code: 'card_declined' },
      });
      expect(problem.detail).toContain('Ngân hàng từ chối thẻ');
      expect(await subscriptionOf(workspaceId)).toEqual(before);
      expect(toldOf(workspaceId)).toEqual([]);

      const [failed] = (await invoicesOf(owner, workspaceId)).items;
      expect(failed).toMatchObject({
        id: problem.context?.['invoiceId'],
        number: problem.context?.['invoiceNumber'],
        status: 'failed',
        payable: true,
        lastAttempt: { number: 1, outcome: 'failed', code: 'card_declined' },
      });
      await owner.get(endpoints.getInvoiceReceipt.path(workspaceId, failed?.id ?? '')).expect(404);
      expect((await logOf(workspaceId)).map((entry) => entry['action'] as string)).toEqual([
        'payment_method_changed',
      ]);
    });

    it('names a card without funds', async () => {
      const { owner, workspaceId } = await trialing();
      await addCard(t, owner, workspaceId, CARD_NO_FUNDS);
      const refused = await choose(owner, workspaceId, {
        planId: 'agency',
        cycle: 'monthly',
        payNow: true,
        expectedAmount: 599_000,
      }).expect(402);
      expect(problemSchema.parse(refused.body).context).toMatchObject({
        code: 'insufficient_funds',
      });
    });

    it('is paid again with another card; the same Idempotency-Key never charges twice', async () => {
      const { owner, workspaceId } = await trialing();
      await addCard(t, owner, workspaceId, CARD_DECLINED);
      const refused = await choose(owner, workspaceId, {
        planId: 'business',
        cycle: 'monthly',
        payNow: true,
        expectedAmount: 1_490_000,
      }).expect(402);
      const invoiceId = String(problemSchema.parse(refused.body).context?.['invoiceId']);

      // The same card, asked again with one key: refused once, answered twice.
      const charge = vi.spyOn(fakeGateway(t), 'charge');
      const again = await payInvoice(owner, workspaceId, invoiceId, 'thanh-toan-lai-1').expect(402);
      await payInvoice(owner, workspaceId, invoiceId, 'thanh-toan-lai-1').expect(402);
      expect(problemSchema.parse(again.body).code).toBe('payment_failed');
      expect(charge).toHaveBeenCalledTimes(1);

      await addCard(t, owner, workspaceId, CARD_OK);
      clock.set(at(1));
      const paid = payInvoiceResponseSchema.parse(
        (await payInvoice(owner, workspaceId, invoiceId, 'thanh-toan-lai-2').expect(200)).body,
      );
      expect(paid.invoice).toMatchObject({
        status: 'paid',
        card: { last4: '4242' },
        payable: false,
        attempts: [
          { number: 1, outcome: 'failed', code: 'card_declined' },
          { number: 2, outcome: 'failed', code: 'card_declined' },
          { number: 3, outcome: 'succeeded', code: null },
        ],
      });
      // The first period starts when it is paid, not when it was quoted.
      expect(Date.parse(paid.invoice.periodStart)).toBeGreaterThanOrEqual(at(1).getTime());
      expect(charge.mock.calls.map(([request]) => request.idempotencyKey)).toEqual([
        `${invoiceId}-2`,
        `${invoiceId}-3`,
      ]);
      const replay = payInvoiceResponseSchema.parse(
        (await payInvoice(owner, workspaceId, invoiceId, 'thanh-toan-lai-2').expect(200)).body,
      );
      expect(replay.invoice.status).toBe('paid');
      expect(charge).toHaveBeenCalledTimes(2);

      const done = await payInvoice(owner, workspaceId, invoiceId, 'thanh-toan-lai-3').expect(409);
      expect(problemSchema.parse(done.body).code).toBe('invoice_not_payable');
      expect(await subscriptionOf(workspaceId)).toMatchObject({
        planId: 'business',
        trialEndsAt: null,
      });
      await payInvoice(owner, workspaceId, invoiceId, 'short').expect(422);
      await owner.post(endpoints.payInvoice.path(workspaceId, invoiceId)).expect(422);
    });
  });

  describe('an upgrade of a paid period', () => {
    it('charges the difference for the days left and applies at once', async () => {
      const paid = await paying();
      const { owner, workspaceId, ownerId } = paid;
      const now = intoPeriod(paid, 18);
      const offer = await quote(owner, workspaceId, { planId: 'business', cycle: 'monthly' });
      // 891.000đ × 12 / 30 = 356.400đ, rounded up to 1.000đ.
      expect(offer).toMatchObject({
        mode: 'upgrade',
        amount: 357_000,
        remainingDays: 12,
        periodDays: 30,
        periodEnd: paid.periodEnd.toISOString(),
      });
      expect(Date.parse(offer.periodStart ?? '')).toBeGreaterThanOrEqual(now.getTime());
      const summary = summaryOf(
        await choose(owner, workspaceId, {
          planId: 'business',
          cycle: 'monthly',
          expectedAmount: 357_000,
        }).expect(200),
      );
      expect(summary).toMatchObject({
        plan: { id: 'business' },
        state: 'active',
        periodStart: paid.periodStart.toISOString(),
        periodEnd: paid.periodEnd.toISOString(),
      });
      const [upgrade, first] = (await invoicesOf(owner, workspaceId)).items;
      expect(first).toMatchObject({ kind: 'subscription', planId: 'agency', amount: 599_000 });
      expect(upgrade).toMatchObject({
        kind: 'upgrade',
        planId: 'business',
        amount: 357_000,
        status: 'paid',
        periodEnd: paid.periodEnd.toISOString(),
      });
      expect(Number(upgrade?.number.slice(-6))).toBeGreaterThan(Number(first?.number.slice(-6)));
      expect((await logOf(workspaceId)).at(-1)).toMatchObject({
        action: 'plan_upgraded',
        actorId: new Types.ObjectId(ownerId),
        from: { planId: 'agency', cycle: 'monthly' },
        to: { planId: 'business', cycle: 'monthly' },
        amount: 357_000,
      });
      expect(toldOf(workspaceId).at(-1)).toEqual(['agency', 'business']);
    });

    it('keeps downgrades, equal prices and cycle changes for the end of the period (T3)', async () => {
      const paid = await paying();
      const { owner, workspaceId } = paid;
      for (const choice of [
        { planId: 'basic', cycle: 'monthly' as const },
        { planId: 'agency', cycle: 'yearly' as const },
        { planId: 'business', cycle: 'yearly' as const },
      ]) {
        const refused = await choose(owner, workspaceId, choice).expect(409);
        expect(problemSchema.parse(refused.body)).toMatchObject({
          code: 'plan_change_unavailable',
          context: { reason: 'scheduled_change' },
        });
      }
      await choose(owner, workspaceId, { planId: 'agency', cycle: 'monthly' }).expect(200);
      intoPeriod(paid, 30);
      const unpaid = await choose(owner, workspaceId, {
        planId: 'business',
        cycle: 'monthly',
        expectedAmount: 0,
      }).expect(409);
      expect(problemSchema.parse(unpaid.body).context).toEqual({ reason: 'unpaid' });
    });

    it('stays on its plan when refused, and a new upgrade voids the refused invoice', async () => {
      const paid = await paying();
      const { owner, workspaceId } = paid;
      await addCard(t, owner, workspaceId, CARD_DECLINED);
      intoPeriod(paid, 10);
      const before = await subscriptionOf(workspaceId);
      const told = toldOf(workspaceId).length;
      await choose(owner, workspaceId, {
        planId: 'business',
        cycle: 'monthly',
        expectedAmount: 594_000,
      }).expect(402);
      expect(await subscriptionOf(workspaceId)).toEqual(before);
      expect(toldOf(workspaceId)).toHaveLength(told);
      const [failed] = (await invoicesOf(owner, workspaceId)).items;
      expect(failed).toMatchObject({ kind: 'upgrade', status: 'failed', payable: true });

      await addCard(t, owner, workspaceId, CARD_OK);
      intoPeriod(paid, 11);
      await choose(owner, workspaceId, {
        planId: 'business',
        cycle: 'monthly',
        expectedAmount: 565_000,
      }).expect(200);
      const items = (await invoicesOf(owner, workspaceId)).items;
      expect(items.map((item) => [item.kind, item.amount, item.status])).toEqual([
        ['upgrade', 565_000, 'paid'],
        ['upgrade', 594_000, 'void'],
        ['subscription', 599_000, 'paid'],
      ]);
      expect(items[1]?.payable).toBe(false);
    });
  });

  describe('one charge at a time', () => {
    it('charges two upgrades sent at once only once', async () => {
      const paid = await paying();
      const { owner, workspaceId } = paid;
      intoPeriod(paid, 18);
      const gateway = fakeGateway(t);
      const real = gateway.charge.bind(gateway);
      const charge = vi.spyOn(gateway, 'charge').mockImplementation(async (request) => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return real(request);
      });
      const body = { planId: 'business', cycle: 'monthly' as const, expectedAmount: 357_000 };
      const responses = await Promise.all([
        choose(owner, workspaceId, body),
        choose(owner, workspaceId, body),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
      const refused = responses.find((response) => response.status === 409);
      expect(['payment_in_progress', 'conflict']).toContain(
        problemSchema.parse(refused?.body).code,
      );
      expect(charge).toHaveBeenCalledTimes(1);
      const upgrades = (await invoicesOf(owner, workspaceId)).items.filter(
        (item) => item.kind === 'upgrade',
      );
      expect(upgrades.map((item) => item.status)).toEqual(['paid']);
      // Sent again after it applied: the plan is the one chosen, nothing more is charged.
      await choose(owner, workspaceId, body).expect(200);
      expect(charge).toHaveBeenCalledTimes(1);
    });

    it('pays an invoice asked twice at once with two keys only once', async () => {
      const { owner, workspaceId } = await trialing();
      await addCard(t, owner, workspaceId, CARD_DECLINED);
      const refused = await choose(owner, workspaceId, {
        planId: 'agency',
        cycle: 'monthly',
        payNow: true,
        expectedAmount: 599_000,
      }).expect(402);
      const invoiceId = String(problemSchema.parse(refused.body).context?.['invoiceId']);
      await addCard(t, owner, workspaceId, CARD_OK);
      const gateway = fakeGateway(t);
      const real = gateway.charge.bind(gateway);
      const charge = vi.spyOn(gateway, 'charge').mockImplementation(async (request) => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return real(request);
      });
      const responses = await Promise.all([
        payInvoice(owner, workspaceId, invoiceId, 'cung-luc-1'),
        payInvoice(owner, workspaceId, invoiceId, 'cung-luc-2'),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
      expect(charge).toHaveBeenCalledTimes(1);
      expect((await invoice(owner, workspaceId, invoiceId)).attempts).toHaveLength(2);
    });
  });

  describe('a charge whose outcome is unknown', () => {
    it('leaves the invoice open, and paying again asks the gateway with the same key', async () => {
      const paid = await paying();
      const { owner, workspaceId } = paid;
      intoPeriod(paid, 18);
      const gateway = fakeGateway(t);
      const charge = vi.spyOn(gateway, 'charge').mockRejectedValueOnce(new Error('socket hang up'));
      const before = await subscriptionOf(workspaceId);
      const unknown = await choose(owner, workspaceId, {
        planId: 'business',
        cycle: 'monthly',
        expectedAmount: 357_000,
      }).expect(503);
      const problem = problemSchema.parse(unknown.body);
      expect(problem.code).toBe('gateway_unavailable');
      const invoiceId = String(problem.context?.['invoiceId']);
      expect(await invoice(owner, workspaceId, invoiceId)).toMatchObject({
        status: 'open',
        payable: true,
        attempts: [{ number: 1, outcome: 'unknown', code: null }],
      });
      expect(await subscriptionOf(workspaceId)).toEqual(before);

      // The hold is released: paying again goes at once, with the first attempt's key.
      const settled = payInvoiceResponseSchema.parse(
        (await payInvoice(owner, workspaceId, invoiceId).expect(200)).body,
      );
      expect(settled.invoice.status).toBe('paid');
      expect(charge.mock.calls.map(([request]) => request.idempotencyKey)).toEqual([
        `${invoiceId}-1`,
        `${invoiceId}-1`,
      ]);
      expect(await subscriptionOf(workspaceId)).toMatchObject({ planId: 'business' });
    });

    it('applies a charge the API could not record when it is paid again, without a second charge', async () => {
      const paid = await paying();
      const { owner, workspaceId } = paid;
      intoPeriod(paid, 18);
      const charge = vi.spyOn(fakeGateway(t), 'charge');
      failHook = true;
      await choose(owner, workspaceId, {
        planId: 'business',
        cycle: 'monthly',
        expectedAmount: 357_000,
      }).expect(500);
      expect(await subscriptionOf(workspaceId)).toMatchObject({
        planId: 'agency',
        lockedUntil: null,
      });
      const [open] = (await invoicesOf(owner, workspaceId)).items;
      expect(open).toMatchObject({ kind: 'upgrade', status: 'open', lastAttempt: null });

      await payInvoice(owner, workspaceId, open?.id ?? '').expect(200);
      const keys = charge.mock.calls.map(([request]) => request.idempotencyKey);
      expect(keys).toEqual([`${open?.id ?? ''}-1`, `${open?.id ?? ''}-1`]);
      expect(await subscriptionOf(workspaceId)).toMatchObject({ planId: 'business' });
    });
  });

  describe('a charge the gateway decides later', () => {
    async function pendingUpgrade() {
      const owner = await paying();
      intoPeriod(owner, 18);
      vi.spyOn(fakeGateway(t), 'charge').mockResolvedValueOnce({ status: 'pending' });
      await choose(owner.owner, owner.workspaceId, {
        planId: 'business',
        cycle: 'monthly',
        expectedAmount: 357_000,
      }).expect(202);
      const [pending] = (await invoicesOf(owner.owner, owner.workspaceId)).items;
      if (pending?.status !== 'pending') {
        throw new Error('The upgrade is not pending');
      }
      return { ...owner, invoiceId: pending.id };
    }

    function chargeEvent(
      invoiceId: string,
      overrides: Partial<Extract<GatewayEvent, { kind: 'charge_failed' }>> = {},
    ): GatewayEvent {
      return {
        kind: 'charge_succeeded',
        eventId: newEventId(),
        occurredAt: new Date().toISOString(),
        reference: invoiceId,
        idempotencyKey: `${invoiceId}-1`,
        amount: 357_000,
        ...overrides,
      } as GatewayEvent;
    }

    it('blocks other charges until the gateway says, then applies once', async () => {
      const { owner, workspaceId, invoiceId } = await pendingUpgrade();
      expect(await subscriptionOf(workspaceId)).toMatchObject({
        planId: 'agency',
        lockedUntil: null,
      });
      const busy = await choose(owner, workspaceId, {
        planId: 'business',
        cycle: 'monthly',
        expectedAmount: 357_000,
      }).expect(409);
      expect(problemSchema.parse(busy.body).code).toBe('payment_in_progress');
      await payInvoice(owner, workspaceId, invoiceId).expect(409);

      const paid = chargeEvent(invoiceId);
      await postGatewayEvent(t, paid).expect(200, { received: true });
      await postGatewayEvent(t, paid).expect(200, { received: true });
      expect(await invoice(owner, workspaceId, invoiceId)).toMatchObject({
        status: 'paid',
        attempts: [
          { number: 1, outcome: 'pending' },
          { number: 1, outcome: 'succeeded' },
        ],
      });
      expect(await subscriptionOf(workspaceId)).toMatchObject({ planId: 'business' });
      const upgrades = (await logOf(workspaceId)).filter(
        (entry) => entry['action'] === 'plan_upgraded',
      );
      expect(upgrades).toHaveLength(1);
      expect(toldOf(workspaceId).filter(([, to]) => to === 'business')).toHaveLength(1);
    });

    it('fails the invoice when the gateway refuses it, and ignores what does not fit', async () => {
      const { owner, workspaceId, invoiceId } = await pendingUpgrade();
      // Another amount, or a refusal of an attempt not being decided, changes nothing.
      await postGatewayEvent(t, chargeEvent(invoiceId, { amount: 1000 })).expect(200);
      await postGatewayEvent(
        t,
        chargeEvent(invoiceId, {
          kind: 'charge_failed',
          idempotencyKey: `${invoiceId}-2`,
          code: 'card_declined',
        }),
      ).expect(200);
      expect((await invoice(owner, workspaceId, invoiceId)).status).toBe('pending');

      await postGatewayEvent(
        t,
        chargeEvent(invoiceId, { kind: 'charge_failed', code: 'insufficient_funds' }),
      ).expect(200);
      expect(await invoice(owner, workspaceId, invoiceId)).toMatchObject({
        status: 'failed',
        payable: true,
        lastAttempt: { number: 1, outcome: 'failed', code: 'insufficient_funds' },
      });
      expect(await subscriptionOf(workspaceId)).toMatchObject({ planId: 'agency' });
    });
  });

  describe('invoices', () => {
    it('never change once paid', async () => {
      const { owner, workspaceId } = await paying();
      const [paid] = (await invoicesOf(owner, workspaceId)).items;
      const stored = () =>
        t.connection.collection('invoices').findOne({ _id: new Types.ObjectId(paid?.id) });
      const before = await stored();
      const repository = t.app.get(InvoicesRepository);
      const attempt = {
        number: 9,
        at: new Date(),
        outcome: 'failed' as const,
        code: 'card_declined' as const,
        requestKey: null,
      };
      const session = await t.connection.startSession();
      try {
        await session.withTransaction(async () => {
          expect(
            await repository.recordCharge(
              new Types.ObjectId(paid?.id),
              ['open', 'pending', 'failed'],
              attempt,
              { status: 'failed' },
              session,
            ),
          ).toBeNull();
          await expect(
            repository.recordCharge(
              new Types.ObjectId(paid?.id),
              ['paid'],
              attempt,
              { status: 'failed' },
              session,
            ),
          ).rejects.toThrow('A paid or void invoice never changes');
          expect(
            await repository.voidUnpaidChanges(
              { workspaceId: new Types.ObjectId(workspaceId) },
              new Date(),
              session,
            ),
          ).toBe(0);
        });
      } finally {
        await session.endSession();
      }
      await postGatewayEvent(t, {
        kind: 'charge_failed',
        eventId: newEventId(),
        occurredAt: new Date().toISOString(),
        reference: paid?.id ?? '',
        idempotencyKey: `${paid?.id ?? ''}-1`,
        amount: paid?.amount ?? 0,
        code: 'card_declined',
      }).expect(200);
      expect(await stored()).toEqual(before);
    });

    it('copy the billing info when made; a later change applies to later invoices only', async () => {
      const { owner, workspaceId } = await trialing();
      const first = {
        companyName: 'Công ty TNHH Truyền thông Mây Xanh',
        taxCode: '0315 123 456',
        address: '12 Nguyễn Đình Chiểu, Phường Đa Kao, TP. Hồ Chí Minh',
        email: 'ketoan@mayxanh.vn',
      };
      await owner.put(endpoints.updateBillingInfo.path(workspaceId), first).expect(200);
      await addCard(t, owner, workspaceId);
      await choose(owner, workspaceId, {
        planId: 'agency',
        cycle: 'monthly',
        payNow: true,
        expectedAmount: 599_000,
      }).expect(200);
      await owner
        .put(endpoints.updateBillingInfo.path(workspaceId), {
          ...first,
          companyName: 'Công ty CP Mây Xanh',
        })
        .expect(200);
      const stored = await subscriptionOf(workspaceId);
      intoPeriod({ periodStart: stored?.['periodStart'] as Date }, 18);
      await choose(owner, workspaceId, {
        planId: 'business',
        cycle: 'monthly',
        expectedAmount: 357_000,
      }).expect(200);
      const [upgrade, start] = (await invoicesOf(owner, workspaceId)).items;
      expect((await invoice(owner, workspaceId, start?.id ?? '')).billingInfo).toEqual({
        ...first,
        taxCode: '0315123456',
      });
      expect((await invoice(owner, workspaceId, upgrade?.id ?? '')).billingInfo?.companyName).toBe(
        'Công ty CP Mây Xanh',
      );
    });

    it('are listed newest first, a page at a time', async () => {
      const paid = await paying();
      const { owner, workspaceId } = paid;
      intoPeriod(paid, 5);
      await addCard(t, owner, workspaceId, CARD_DECLINED);
      // 891.000đ × 25 / 30 = 742.500đ → 743.000đ.
      for (const amount of [743_000, 743_000]) {
        await choose(owner, workspaceId, {
          planId: 'business',
          cycle: 'monthly',
          expectedAmount: amount,
        }).expect(402);
      }
      const first = await owner
        .get(endpoints.listInvoices.path(workspaceId))
        .query({ limit: 2 })
        .expect(200);
      const page = first.body as { items: Array<{ status: string }>; nextCursor: string | null };
      expect(page.items.map((item) => item.status)).toEqual(['failed', 'void']);
      expect(page.nextCursor).not.toBeNull();
      const rest = await owner
        .get(endpoints.listInvoices.path(workspaceId))
        .query({ limit: 2, cursor: page.nextCursor })
        .expect(200);
      expect((rest.body as typeof page).items.map((item) => item.status)).toEqual(['paid']);
      expect((rest.body as typeof page).nextCursor).toBeNull();
      await owner.get(endpoints.listInvoices.path(workspaceId)).query({ limit: 51 }).expect(422);
    });
  });
});
