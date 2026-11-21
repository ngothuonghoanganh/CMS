import {
  type BillingSummary,
  billingSummarySchema,
  type DueInvoice,
  endpoints,
  type GatewayEvent,
  type Invoice,
  invoiceSchema,
  planChangeQuoteSchema,
  problemSchema,
  type RenewalMethod,
  workspacePlanSchema,
} from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import {
  addCard,
  CARD_DECLINED,
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

const DAY_MS = 86_400_000;
/** 10:00 on 01/11/2026 in Vietnam: the trials of this file start then. */
const START = new Date('2026-11-01T03:00:00.000Z');
const after = (from: Date, days: number, ms = 0) => new Date(from.getTime() + days * DAY_MS + ms);
/** A time the job or a request took from the moved clock, which keeps running: within a minute. */
const near = (at: Date) =>
  expect.toSatisfy(
    (value: string) => Math.abs(new Date(value).getTime() - at.getTime()) < 60_000,
    `within a minute of ${at.toISOString()}`,
  ) as unknown;

describe('renewing by bank transfer (ADR-035, T4)', () => {
  let t: TestApp;
  let clock: BillingClock;
  let scheduler: BillingScheduler;

  beforeAll(async () => {
    t = await createTestApp('plp_test_billing_transfer_renewal', {
      env: { BILLING_TEST_CLOCK: 'on', PLAN_CATALOG_FILE: BUNDLED_PLAN_CATALOG_FILE },
    });
    clock = t.app.get(BillingClock);
    scheduler = t.app.get(BillingScheduler);
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

  const logOf = async (workspaceId: string) =>
    (
      await t.connection
        .collection('billing_log')
        .find({ workspaceId: new Types.ObjectId(workspaceId) })
        .sort({ _id: 1 })
        .toArray()
    ).map((entry) => entry['action'] as string);

  /** The `billing-transfer-due` emails to `email`, of one stage. */
  const transferEmails = (email: string, stage: 'issued' | 'due') =>
    t.emails.sent.filter(
      (sent) =>
        sent.template === 'billing-transfer-due' &&
        sent.to.includes(email) &&
        sent.idempotencyKey.endsWith(`:${stage}`),
    );
  const emailsTo = (email: string, template: string) =>
    t.emails.sent.filter((sent) => sent.template === template && sent.to.includes(email));

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

  async function invoiceOf(owner: TestClient, workspaceId: string, id: string): Promise<Invoice> {
    return invoiceSchema.parse(
      (await owner.get(endpoints.getInvoice.path(workspaceId, id)).expect(200)).body,
    );
  }

  function setMethod(owner: TestClient, workspaceId: string, method: RenewalMethod | 'wallet') {
    return owner.put(endpoints.setRenewalMethod.path(workspaceId), { method });
  }

  /** The invoices made before the end for a renewal by transfer, oldest first. */
  async function renewalInvoices(workspaceId: string) {
    return t.connection
      .collection('invoices')
      .find({ workspaceId: new Types.ObjectId(workspaceId), transferRenewal: true })
      .sort({ _id: 1 })
      .toArray();
  }

  async function storedTime(workspaceId: string, field: string): Promise<Date> {
    const value: unknown = (
      await t.connection
        .collection('subscriptions')
        .findOne({ _id: new Types.ObjectId(workspaceId) })
    )?.[field];
    if (!(value instanceof Date)) {
      throw new Error(`The subscription has no ${field}`);
    }
    return value;
  }

  function received(invoice: Pick<Invoice, 'id' | 'amount'>): GatewayEvent {
    return {
      kind: 'transfer_received',
      eventId: newEventId(),
      occurredAt: new Date().toISOString(),
      reference: invoice.id,
      amount: invoice.amount,
    };
  }

  /** A paid month of Gói Agency, charged to a valid card when the trial ended. */
  async function paying(): Promise<{
    owner: TestClient;
    workspaceId: string;
    email: string;
    periodEnd: Date;
  }> {
    clock.set(START);
    const { client: owner, workspaceId, me } = await signedUpClient(t.app);
    await addCard(t, owner, workspaceId, CARD_OK);
    await runAt(await storedTime(workspaceId, 'trialEndsAt'));
    const paid = await summaryOf(owner, workspaceId);
    expect(paid.state).toBe('active');
    return { owner, workspaceId, email: me.user.email, periodEnd: new Date(paid.periodEnd) };
  }

  /** A paid month renewed by transfer, whose next invoice the job made 7 days before its end. */
  async function invoiced(): Promise<Awaited<ReturnType<typeof paying>> & { invoice: DueInvoice }> {
    const paid = await paying();
    clock.set(after(paid.periodEnd, -10));
    await setMethod(paid.owner, paid.workspaceId, 'transfer').expect(200);
    await runAt(after(paid.periodEnd, -7));
    const invoice = (await summaryOf(paid.owner, paid.workspaceId)).renewal?.invoice;
    if (invoice == null) {
      throw new Error('The job made no invoice for the transfer');
    }
    return { ...paid, invoice };
  }

  it('sets how the next period is paid: the card needs one that can pay, each change is logged', async () => {
    clock.set(START);
    const { client: owner, workspaceId } = await signedUpClient(t.app);
    const trialEnd = await storedTime(workspaceId, 'trialEndsAt');
    // The card by default; choosing it needs a card that can pay.
    expect((await summaryOf(owner, workspaceId)).renewalMethod).toBe('card');
    const refused = await setMethod(owner, workspaceId, 'card').expect(422);
    expect(problemSchema.parse(refused.body).code).toBe('payment_method_required');
    const wallet = await setMethod(owner, workspaceId, 'wallet').expect(422);
    expect(problemSchema.parse(wallet.body).code).toBe('validation_failed');

    const chosen = billingSummarySchema.parse(
      (await setMethod(owner, workspaceId, 'transfer').expect(200)).body,
    );
    expect(chosen).toMatchObject({
      renewalMethod: 'transfer',
      state: 'trialing',
      awaitingTransfer: false,
      renewal: {
        method: 'transfer',
        at: trialEnd.toISOString(),
        invoiceAt: after(trialEnd, -7).toISOString(),
        invoice: null,
        paid: false,
        autoRenews: false,
        blocker: null,
      },
    });
    // The same method again changes nothing.
    await setMethod(owner, workspaceId, 'transfer').expect(200);
    await addCard(t, owner, workspaceId, CARD_OK);
    expect(
      billingSummarySchema.parse((await setMethod(owner, workspaceId, 'card').expect(200)).body),
    ).toMatchObject({ renewalMethod: 'card', renewal: { method: 'card', autoRenews: true } });
    expect(
      (await logOf(workspaceId)).filter((action) => action !== 'payment_method_changed'),
    ).toEqual(['renewal_method_changed', 'renewal_method_changed']);
    const methods = await t.connection
      .collection('billing_log')
      .find({ workspaceId: new Types.ObjectId(workspaceId), action: 'renewal_method_changed' })
      .sort({ _id: 1 })
      .toArray();
    expect(methods.map((entry) => entry['renewalMethod'] as string)).toEqual(['transfer', 'card']);
  });

  it('makes the next period’s invoice once, 7 days before the end, however often or late the job runs', async () => {
    const { owner, workspaceId, email, periodEnd } = await paying();
    clock.set(after(periodEnd, -10));
    await setMethod(owner, workspaceId, 'transfer').expect(200);
    expect(await renewalInvoices(workspaceId)).toHaveLength(0);
    expect(await storedTime(workspaceId, 'nextActionAt')).toEqual(after(periodEnd, -7));

    expect(await runAt(after(periodEnd, -7))).toBe(1);
    // Run again at once, and once more a day late as if it had not finished.
    expect(await runAt(after(periodEnd, -7))).toBe(0);
    await t.connection
      .collection('subscriptions')
      .updateOne(
        { _id: new Types.ObjectId(workspaceId) },
        { $set: { nextActionAt: after(periodEnd, -6) } },
      );
    expect(await runAt(after(periodEnd, -6))).toBe(1);
    expect(await renewalInvoices(workspaceId)).toHaveLength(1);

    const summary = await summaryOf(owner, workspaceId);
    expect(summary).toMatchObject({
      state: 'active',
      awaitingTransfer: false,
      dueInvoice: null,
      renewal: {
        method: 'transfer',
        at: periodEnd.toISOString(),
        invoiceAt: near(after(periodEnd, -7)),
        invoice: { status: 'pending', method: 'transfer', amount: 599_000, payable: true },
        paid: false,
        planId: 'agency',
        amount: 599_000,
      },
    });
    const invoice = await invoiceOf(owner, workspaceId, summary.renewal?.invoice?.id ?? '');
    expect(invoice).toMatchObject({
      kind: 'subscription',
      status: 'pending',
      method: 'transfer',
      from: null,
      endsTrial: false,
      periodStart: periodEnd.toISOString(),
      periodEnd: periodEndOf(periodEnd, 'monthly').toISOString(),
      transfer: {
        content: `PLP ${invoice.number}`,
        amount: 599_000,
        accountNumber: '0000000000',
      },
    });
    expect(invoice.transfer?.qrDataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
    // Its email once, with what to transfer and until when; no "Sắp hết hạn".
    expect(transferEmails(email, 'issued')).toEqual([
      expect.objectContaining({
        idempotencyKey: `billing-transfer-due:${invoice.id}:issued`,
        data: expect.objectContaining({
          invoiceNumber: invoice.number,
          amount: '599.000 ₫',
          dueOn: vnDateText(periodEnd),
          graceEndsOn: vnDateText(after(periodEnd, 7)),
          content: `PLP ${invoice.number}`,
          replacesInvoiceNumber: null,
        }) as unknown,
      }),
    ]);
    expect(emailsTo(email, 'billing-expiring-soon')).toEqual([]);
    expect((await logOf(workspaceId)).at(-1)).toBe('transfer_started');
  });

  it('makes the invoice at once when the transfer is chosen within its 7 days, and late once', async () => {
    const { owner, workspaceId, email, periodEnd } = await paying();
    clock.set(after(periodEnd, -3));
    const chosen = billingSummarySchema.parse(
      (await setMethod(owner, workspaceId, 'transfer').expect(200)).body,
    );
    expect(chosen.renewal).toMatchObject({
      method: 'transfer',
      invoiceAt: near(after(periodEnd, -3)),
      invoice: { status: 'pending', amount: 599_000 },
    });
    expect(transferEmails(email, 'issued')).toHaveLength(1);
    // The job finds nothing more to make.
    await runAt(after(periodEnd, -2));
    expect(await renewalInvoices(workspaceId)).toHaveLength(1);

    // A job that never ran at its time makes one invoice when it runs late.
    const late = await paying();
    clock.set(after(late.periodEnd, -10));
    await setMethod(late.owner, late.workspaceId, 'transfer').expect(200);
    expect(await runAt(after(late.periodEnd, -2))).toBeGreaterThanOrEqual(1);
    await runAt(after(late.periodEnd, -2));
    expect(await renewalInvoices(late.workspaceId)).toHaveLength(1);
    expect(transferEmails(late.email, 'issued')).toHaveLength(1);
  });

  it('completes an invoice the gateway gave no details for, and one a refused card dropped them from', async () => {
    const { owner, workspaceId, email, periodEnd } = await paying();
    clock.set(after(periodEnd, -10));
    await setMethod(owner, workspaceId, 'transfer').expect(200);
    const startTransfer = vi
      .spyOn(fakeGateway(t), 'startTransfer')
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    const issuedAt = after(periodEnd, -7);
    await runAt(issuedAt);
    const [made] = await renewalInvoices(workspaceId);
    expect(made).toMatchObject({ status: 'pending', method: 'transfer', transfer: null });
    expect(transferEmails(email, 'issued')).toEqual([]);
    // The job comes back 15 minutes later for it.
    const retryAt = await storedTime(workspaceId, 'nextActionAt');
    expect(retryAt.getTime() - issuedAt.getTime()).toBeGreaterThanOrEqual(15 * 60_000);
    expect(retryAt.getTime() - issuedAt.getTime()).toBeLessThan(16 * 60_000);
    await runAt(retryAt);
    expect(startTransfer).toHaveBeenCalledTimes(2);
    const invoiceId = String(made?.['_id']);
    expect((await invoiceOf(owner, workspaceId, invoiceId)).transfer).toMatchObject({
      accountNumber: '0000000000',
    });
    expect(transferEmails(email, 'issued')).toHaveLength(1);

    // The owner pays it by a card the bank refuses: the invoice is not lost to the transfer.
    await addCard(t, owner, workspaceId, CARD_DECLINED);
    clock.set(after(periodEnd, -5));
    await payInvoice(owner, workspaceId, invoiceId).expect(402);
    const refused = await summaryOf(owner, workspaceId);
    expect(refused).toMatchObject({
      state: 'active',
      failedSince: null,
      renewal: { method: 'transfer', invoice: { id: invoiceId, status: 'failed' } },
    });
    expect(await scheduler.runDue()).toBe(1);
    expect(await invoiceOf(owner, workspaceId, invoiceId)).toMatchObject({
      status: 'pending',
      method: 'transfer',
      transfer: { content: expect.stringMatching(/^PLP HD-/) as unknown },
    });
    expect(transferEmails(email, 'issued')).toHaveLength(1);
    expect(emailsTo(email, 'billing-charge-failed')).toEqual([]);
  });

  it('starts a period paid before its end at that end: no day lost, no card charged, the scheduled change applied then', async () => {
    const { owner, workspaceId, email, periodEnd } = await paying();
    clock.set(after(periodEnd, -10));
    await owner
      .post(endpoints.changePlan.path(workspaceId), { planId: 'basic', cycle: 'monthly' })
      .expect(200);
    await setMethod(owner, workspaceId, 'transfer').expect(200);
    await runAt(after(periodEnd, -7));
    const [stored] = await renewalInvoices(workspaceId);
    const invoice = { id: String(stored?.['_id']), amount: Number(stored?.['amount']) };
    expect(invoice.amount).toBe(199_000);
    const before = (await invoicesOf(owner, workspaceId)).items.length;
    const charge = vi.spyOn(fakeGateway(t), 'charge');

    clock.set(after(periodEnd, -3));
    await postGatewayEvent(t, received(invoice)).expect(200);
    expect(await summaryOf(owner, workspaceId)).toMatchObject({
      state: 'active',
      plan: { id: 'agency' },
      periodEnd: periodEnd.toISOString(),
      scheduledChange: { planId: 'basic', cycle: 'monthly' },
      renewal: {
        at: periodEnd.toISOString(),
        planId: 'basic',
        amount: 199_000,
        paid: true,
        autoRenews: false,
        invoice: { id: invoice.id, status: 'paid' },
      },
    });
    expect((await logOf(workspaceId)).at(-1)).toBe('renewal_prepaid');
    expect(emailsTo(email, 'billing-receipt')).toHaveLength(2);

    // Nothing changes the paid period until it starts.
    for (const refused of [
      await owner
        .post(endpoints.changePlan.path(workspaceId), { planId: 'business', cycle: 'monthly' })
        .expect(409),
      await owner.post(endpoints.cancelPlan.path(workspaceId)).expect(409),
      await owner.delete(endpoints.cancelScheduledChange.path(workspaceId)).expect(409),
    ]) {
      expect(problemSchema.parse(refused.body).context).toEqual({ reason: 'next_period_paid' });
    }
    expect(
      planChangeQuoteSchema.parse(
        (
          await owner
            .get(endpoints.getPlanChangeQuote.path(workspaceId))
            .query({ planId: 'business', cycle: 'monthly', payNow: 'false' })
            .expect(200)
        ).body,
      ),
    ).toMatchObject({ mode: 'unavailable', unavailableReason: 'next_period_paid' });

    await runAt(periodEnd);
    const nextEnd = periodEndOf(periodEnd, 'monthly');
    expect(await summaryOf(owner, workspaceId)).toMatchObject({
      state: 'active',
      plan: { id: 'basic' },
      cycle: 'monthly',
      periodStart: periodEnd.toISOString(),
      periodEnd: nextEnd.toISOString(),
      scheduledChange: null,
      renewal: {
        method: 'transfer',
        paid: false,
        invoice: null,
        invoiceAt: after(nextEnd, -7).toISOString(),
      },
    });
    expect(charge).not.toHaveBeenCalled();
    expect((await invoicesOf(owner, workspaceId)).items).toHaveLength(before);
    expect((await logOf(workspaceId)).slice(-2)).toEqual([
      'period_renewed',
      'scheduled_change_applied',
    ]);
    expect(await storedTime(workspaceId, 'nextActionAt')).toEqual(after(nextEnd, -7));
  });

  it('waits for the transfer in the grace when the end comes unpaid, without a failure, then read-only, then active again', async () => {
    const { owner, workspaceId, email, periodEnd, invoice } = await invoiced();
    const charge = vi.spyOn(fakeGateway(t), 'charge');

    await runAt(periodEnd);
    expect(await summaryOf(owner, workspaceId)).toMatchObject({
      state: 'pending_payment',
      access: 'full',
      awaitingTransfer: true,
      dueInvoice: { id: invoice.id, status: 'pending', method: 'transfer', payable: true },
      failedSince: null,
      nextRetryAt: null,
      graceEndsAt: after(periodEnd, 7).toISOString(),
      graceDaysLeft: 7,
      renewal: null,
    });
    expect(
      workspacePlanSchema.parse(
        (await owner.get(endpoints.getWorkspacePlan.path(workspaceId)).expect(200)).body,
      ),
    ).toMatchObject({
      state: 'pending_payment',
      awaitingTransfer: true,
      paymentWaiting: true,
      graceDaysLeft: 7,
    });
    expect(transferEmails(email, 'due')).toEqual([
      expect.objectContaining({
        idempotencyKey: `billing-transfer-due:${invoice.id}:due`,
        data: expect.objectContaining({ dueToday: true, invoiceNumber: invoice.number }) as unknown,
      }),
    ]);
    // T3 still blocks a plan change while the period waits.
    const blocked = await owner
      .post(endpoints.changePlan.path(workspaceId), { planId: 'basic', cycle: 'monthly' })
      .expect(409);
    expect(problemSchema.parse(blocked.body).context).toEqual({ reason: 'unpaid' });

    // No retry on the retry days, no failure.
    await runAt(after(periodEnd, 2, 60_000));
    await runAt(after(periodEnd, 5, 60_000));
    expect(charge).not.toHaveBeenCalled();
    expect(emailsTo(email, 'billing-charge-failed')).toEqual([]);

    await runAt(after(periodEnd, 7));
    expect(await summaryOf(owner, workspaceId)).toMatchObject({
      state: 'pending_payment',
      access: 'read_only',
      awaitingTransfer: true,
    });
    expect(emailsTo(email, 'billing-read-only')).toHaveLength(1);

    clock.set(after(periodEnd, 8));
    await postGatewayEvent(t, received(invoice)).expect(200);
    expect(await summaryOf(owner, workspaceId)).toMatchObject({
      state: 'active',
      access: 'full',
      awaitingTransfer: false,
      dueInvoice: null,
      // Paid within the period it was made for: it keeps that period (T3).
      periodStart: periodEnd.toISOString(),
      periodEnd: periodEndOf(periodEnd, 'monthly').toISOString(),
    });
    expect(transferEmails(email, 'due')).toHaveLength(1);
    expect(charge).not.toHaveBeenCalled();
  });

  it('voids the unpaid early invoice on a plan change and makes its replacement at once, with its email', async () => {
    const { owner, workspaceId, email, periodEnd, invoice: first } = await invoiced();
    clock.set(after(periodEnd, -5));
    expect(
      planChangeQuoteSchema.parse(
        (
          await owner
            .get(endpoints.getPlanChangeQuote.path(workspaceId))
            .query({ planId: 'basic', cycle: 'monthly', payNow: 'false' })
            .expect(200)
        ).body,
      ),
    ).toMatchObject({
      mode: 'scheduled',
      renewalInvoiceVoided: { invoiceId: first.id, invoiceNumber: first.number },
    });

    const scheduled = billingSummarySchema.parse(
      (
        await owner
          .post(endpoints.changePlan.path(workspaceId), { planId: 'basic', cycle: 'monthly' })
          .expect(200)
      ).body,
    );
    const second = scheduled.renewal?.invoice;
    expect(second).toMatchObject({ status: 'pending', amount: 199_000, planId: 'basic' });
    expect(second?.id).not.toBe(first.id);
    expect((await invoiceOf(owner, workspaceId, first.id)).status).toBe('void');
    const replacement = await invoiceOf(owner, workspaceId, second?.id ?? '');
    expect(replacement.transfer?.content).toBe(`PLP ${replacement.number}`);
    expect(transferEmails(email, 'issued').map((sent) => sent.data)).toEqual([
      expect.objectContaining({ invoiceNumber: first.number, replacesInvoiceNumber: null }),
      expect.objectContaining({
        invoiceNumber: replacement.number,
        amount: '199.000 ₫',
        replacesInvoiceNumber: first.number,
      }),
    ]);
    expect((await logOf(workspaceId)).slice(-3)).toEqual([
      'change_scheduled',
      'renewal_invoice_voided',
      'transfer_started',
    ]);

    // A transfer that arrives for the voided invoice pays nothing.
    await postGatewayEvent(t, received(first)).expect(200);
    expect((await summaryOf(owner, workspaceId)).renewal?.invoice).toMatchObject({
      id: replacement.id,
      status: 'pending',
    });

    // Dropping the schedule replaces it again, at the plan's own price.
    const dropped = billingSummarySchema.parse(
      (await owner.delete(endpoints.cancelScheduledChange.path(workspaceId)).expect(200)).body,
    );
    expect(dropped.renewal?.invoice).toMatchObject({ status: 'pending', amount: 599_000 });
    expect((await invoiceOf(owner, workspaceId, replacement.id)).status).toBe('void');

    // "Hủy gói" voids it and makes none; "Giữ lại gói" makes one at once.
    const canceled = billingSummarySchema.parse(
      (await owner.post(endpoints.cancelPlan.path(workspaceId)).expect(200)).body,
    );
    expect(canceled).toMatchObject({ state: 'cancel_scheduled', renewal: null });
    const pending = async () =>
      (await renewalInvoices(workspaceId)).filter((stored) => stored['status'] === 'pending');
    expect(await pending()).toHaveLength(0);
    const kept = billingSummarySchema.parse(
      (await owner.post(endpoints.keepPlan.path(workspaceId)).expect(200)).body,
    );
    expect(kept.renewal?.invoice).toMatchObject({ status: 'pending', amount: 599_000 });
    expect(await pending()).toHaveLength(1);
    expect(await renewalInvoices(workspaceId)).toHaveLength(4);
  });

  it('replaces the early invoice when an upgrade is paid, at the new plan’s price', async () => {
    const { owner, workspaceId, email, periodEnd, invoice: first } = await invoiced();
    clock.set(after(periodEnd, -5));
    const quote = planChangeQuoteSchema.parse(
      (
        await owner
          .get(endpoints.getPlanChangeQuote.path(workspaceId))
          .query({ planId: 'business', cycle: 'monthly', payNow: 'false' })
          .expect(200)
      ).body,
    );
    expect(quote).toMatchObject({
      mode: 'upgrade',
      renewalInvoiceVoided: { invoiceId: first.id },
    });
    const upgraded = billingSummarySchema.parse(
      (
        await owner
          .post(endpoints.changePlan.path(workspaceId), {
            planId: 'business',
            cycle: 'monthly',
            expectedAmount: quote.amount,
          })
          .expect(200)
      ).body,
    );
    expect(upgraded).toMatchObject({
      plan: { id: 'business' },
      renewal: { invoice: { status: 'pending', amount: 1_490_000, planId: 'business' } },
    });
    expect((await invoiceOf(owner, workspaceId, first.id)).status).toBe('void');
    expect(transferEmails(email, 'issued').at(-1)?.data).toMatchObject({
      amount: '1.490.000 ₫',
      replacesInvoiceNumber: first.number,
    });
  });

  it('charges the card at the end for that same invoice once the method went back to the card', async () => {
    const { owner, workspaceId, email, periodEnd, invoice } = await invoiced();
    clock.set(after(periodEnd, -5));
    expect(
      billingSummarySchema.parse((await setMethod(owner, workspaceId, 'card').expect(200)).body)
        .renewal,
    ).toMatchObject({
      method: 'card',
      autoRenews: true,
      invoice: { id: invoice.id, status: 'pending', method: 'transfer' },
    });
    const charge = vi.spyOn(fakeGateway(t), 'charge');

    await runAt(periodEnd);
    expect(charge.mock.calls.map(([request]) => request.reference)).toEqual([invoice.id]);
    expect(await invoiceOf(owner, workspaceId, invoice.id)).toMatchObject({
      status: 'paid',
      method: 'card',
      card: { last4: '4242' },
    });
    expect(await summaryOf(owner, workspaceId)).toMatchObject({
      state: 'active',
      periodStart: periodEnd.toISOString(),
      awaitingTransfer: false,
    });
    expect(await renewalInvoices(workspaceId)).toHaveLength(1);
    expect(transferEmails(email, 'due')).toEqual([]);
  });

  it('renews a trial by transfer: its first period paid before its end starts at that end', async () => {
    clock.set(START);
    const { client: owner, workspaceId } = await signedUpClient(t.app);
    const trialEnd = await storedTime(workspaceId, 'trialEndsAt');
    await setMethod(owner, workspaceId, 'transfer').expect(200);
    await runAt(after(trialEnd, -7));
    const trialing = await summaryOf(owner, workspaceId);
    expect(trialing).toMatchObject({
      state: 'trialing',
      renewal: { invoice: { status: 'pending', amount: 599_000, planId: 'agency' } },
    });
    const invoice = trialing.renewal?.invoice;
    if (invoice == null) {
      throw new Error('The trial got no invoice for its transfer');
    }
    expect(await invoiceOf(owner, workspaceId, invoice.id)).toMatchObject({
      endsTrial: true,
      periodStart: trialEnd.toISOString(),
    });

    clock.set(after(trialEnd, -2));
    await postGatewayEvent(t, received(invoice)).expect(200);
    expect(await summaryOf(owner, workspaceId)).toMatchObject({
      state: 'trialing',
      trialDaysLeft: 2,
      renewal: { paid: true },
    });

    await runAt(trialEnd);
    expect(await summaryOf(owner, workspaceId)).toMatchObject({
      state: 'active',
      trialEndsAt: null,
      periodStart: trialEnd.toISOString(),
      periodEnd: periodEndOf(trialEnd, 'monthly').toISOString(),
    });
    expect((await logOf(workspaceId)).slice(-2)).toEqual(['renewal_prepaid', 'paid_plan_started']);
  });

  it('voids the trial’s transfer invoice when the trial is paid now, by transfer or by card', async () => {
    for (const payWith of ['transfer', 'card'] as const) {
      clock.set(START);
      const { client: owner, workspaceId } = await signedUpClient(t.app);
      const trialEnd = await storedTime(workspaceId, 'trialEndsAt');
      await setMethod(owner, workspaceId, 'transfer').expect(200);
      if (payWith === 'card') {
        await addCard(t, owner, workspaceId, CARD_OK);
      }
      await runAt(after(trialEnd, -7));
      const early = (await summaryOf(owner, workspaceId)).renewal?.invoice;
      if (early == null) {
        throw new Error('The trial got no invoice for its transfer');
      }
      clock.set(after(trialEnd, -5));
      const quote = planChangeQuoteSchema.parse(
        (
          await owner
            .get(endpoints.getPlanChangeQuote.path(workspaceId))
            .query({ planId: 'business', cycle: 'monthly', payNow: 'true' })
            .expect(200)
        ).body,
      );
      expect(quote).toMatchObject({
        mode: 'start_paid',
        renewalInvoiceVoided: { invoiceId: early.id, invoiceNumber: early.number },
      });
      const paid = billingSummarySchema.parse(
        (
          await owner
            .post(endpoints.changePlan.path(workspaceId), {
              planId: 'business',
              cycle: 'monthly',
              payNow: true,
              expectedAmount: quote.amount,
              ...(payWith === 'transfer' ? { payWith } : {}),
            })
            .expect(payWith === 'transfer' ? 202 : 200)
        ).body,
      );
      expect((await invoiceOf(owner, workspaceId, early.id)).status).toBe('void');
      if (payWith === 'transfer') {
        // One transfer pays the period: the one of "Thanh toán ngay".
        expect(paid).toMatchObject({
          state: 'trialing',
          dueInvoice: { status: 'pending', method: 'transfer', amount: 1_490_000 },
          renewal: null,
        });
      } else {
        expect(paid).toMatchObject({
          state: 'active',
          plan: { id: 'business' },
          trialEndsAt: null,
        });
      }
      expect(await logOf(workspaceId)).toContain('renewal_invoice_voided');
    }
  });

  it('gives a trial that ends unpaid the grace, not `trial_expired`, but none when chosen after it', async () => {
    clock.set(START);
    const { client: owner, workspaceId, me } = await signedUpClient(t.app);
    const trialEnd = await storedTime(workspaceId, 'trialEndsAt');
    await setMethod(owner, workspaceId, 'transfer').expect(200);
    await runAt(after(trialEnd, -7));
    await runAt(trialEnd);
    expect(await summaryOf(owner, workspaceId)).toMatchObject({
      state: 'pending_payment',
      access: 'full',
      awaitingTransfer: true,
      graceEndsAt: after(trialEnd, 7).toISOString(),
    });
    expect(transferEmails(me.user.email, 'due')).toHaveLength(1);
    expect(emailsTo(me.user.email, 'billing-trial-ending')).toEqual([]);
    await runAt(after(trialEnd, 7));
    expect(await summaryOf(owner, workspaceId)).toMatchObject({
      state: 'pending_payment',
      access: 'read_only',
    });

    clock.set(START);
    const late = await signedUpClient(t.app);
    await runAt(trialEnd);
    clock.set(after(trialEnd, 1));
    await setMethod(late.client, late.workspaceId, 'transfer').expect(200);
    await scheduler.runDue();
    expect(await summaryOf(late.client, late.workspaceId)).toMatchObject({
      state: 'trial_expired',
      access: 'read_only',
      renewal: null,
    });
    expect(await renewalInvoices(late.workspaceId)).toHaveLength(0);
  });

  it('keeps each workspace’s renewal to itself', async () => {
    const a = await invoiced();
    clock.set(after(a.periodEnd, -5));
    const b = await signedUpClient(t.app);
    await b.client
      .put(endpoints.setRenewalMethod.path(a.workspaceId), { method: 'card' })
      .expect(404);
    await b.client.get(endpoints.getBillingSummary.path(a.workspaceId)).expect(404);
    await b.client.get(endpoints.getInvoice.path(b.workspaceId, a.invoice.id)).expect(404);
    expect((await summaryOf(a.owner, a.workspaceId)).renewalMethod).toBe('transfer');
    expect((await summaryOf(b.client, b.workspaceId)).renewalMethod).toBe('card');
  });
});
