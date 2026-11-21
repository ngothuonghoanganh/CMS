import {
  type BillingSummary,
  billingSummarySchema,
  endpoints,
  type GatewayEvent,
  type Invoice,
  invoiceSchema,
  problemSchema,
  startTransferResponseSchema,
} from '@plp/contracts';
import { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import { TEST_ADMIN_ORIGIN } from '../../../test/env.js';
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
import { addMember } from '../../../test/resources.js';
import { BUNDLED_PLAN_CATALOG_FILE } from '../../config/env.js';
import { BillingClock } from './billing-clock.js';
import { BillingScheduler } from './billing-scheduler.service.js';
import { periodEndOf } from './domain/billing-period.js';
import { FakeWebhookSender } from './gateway/fake/fake-webhook-sender.js';

const DAY_MS = 86_400_000;
const START = new Date('2026-11-01T03:00:00.000Z');
const after = (from: Date, days: number, ms = 0) => new Date(from.getTime() + days * DAY_MS + ms);

describe('paying by bank transfer (ADR-035, T3)', () => {
  let t: TestApp;
  let clock: BillingClock;
  let scheduler: BillingScheduler;

  beforeAll(async () => {
    t = await createTestApp('plp_test_billing_transfer', {
      env: { BILLING_TEST_CLOCK: 'on', PLAN_CATALOG_FILE: BUNDLED_PLAN_CATALOG_FILE },
    });
    clock = t.app.get(BillingClock);
    scheduler = t.app.get(BillingScheduler);
    // The transfer page posts its event over HTTP, so the API listens on a port of its own here.
    const listening = await t.app.listen(0, '127.0.0.1');
    const address = listening.address();
    if (address === null || typeof address === 'string') {
      throw new Error('The test API did not listen on a port');
    }
    t.app.get(FakeWebhookSender).target(`http://127.0.0.1:${address.port}`, [5, 5]);
  });

  afterEach(async () => {
    clock.set(null);
    vi.restoreAllMocks();
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

  async function runAt(at: Date): Promise<number> {
    clock.set(at);
    return scheduler.runDue();
  }

  async function summaryOf(owner: TestClient, workspaceId: string): Promise<BillingSummary> {
    return billingSummarySchema.parse(
      (await owner.get(endpoints.getBillingSummary.path(workspaceId)).expect(200)).body,
    );
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

  /** An owner whose trial ended on a refused card: the charge of its end waits, failed. */
  async function refused(): Promise<{
    owner: TestClient;
    workspaceId: string;
    email: string;
    trialEnd: Date;
    due: string;
  }> {
    clock.set(START);
    const { client: owner, workspaceId, me } = await signedUpClient(t.app);
    const trialEnd = await storedTime(workspaceId, 'trialEndsAt');
    await addCard(t, owner, workspaceId, CARD_DECLINED);
    await runAt(trialEnd);
    const { dueInvoice } = await summaryOf(owner, workspaceId);
    if (dueInvoice === null) {
      throw new Error('The end of the trial left no invoice to pay');
    }
    return { owner, workspaceId, email: me.user.email, trialEnd, due: dueInvoice.id };
  }

  function startTransfer(owner: TestClient, workspaceId: string, invoiceId: string) {
    return owner.post(endpoints.startInvoiceTransfer.path(workspaceId, invoiceId));
  }

  async function transferOf(owner: TestClient, workspaceId: string, invoiceId: string) {
    const started = startTransferResponseSchema.parse(
      (await startTransfer(owner, workspaceId, invoiceId).expect(200)).body,
    );
    return started.invoice;
  }

  function received(invoice: Invoice, eventId = newEventId()): GatewayEvent {
    return {
      kind: 'transfer_received',
      eventId,
      occurredAt: new Date().toISOString(),
      reference: invoice.id,
      amount: invoice.amount,
    };
  }

  it('waits for a transfer of a refused invoice, without retrying the card, then the transfer pays it', async () => {
    const { owner, workspaceId, email, trialEnd, due } = await refused();
    const invoice = await transferOf(owner, workspaceId, due);
    expect(invoice).toMatchObject({
      status: 'pending',
      method: 'transfer',
      payable: true,
      transfer: {
        bankName: 'Ngân hàng thử (cổng thanh toán giả)',
        accountNumber: '0000000000',
        accountName: 'PAYLOAD LANDING PAGE',
        content: `PLP ${invoice.number}`,
        amount: 599_000,
      },
    });
    expect(invoice.transfer?.qrDataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(invoice.transfer?.pageUrl).toMatch(
      /^http:\/\/localhost:3100\/api\/public\/billing\/fake-gateway\/transfer\?session=/,
    );
    // Asked again: the same details, no second transfer.
    expect(await transferOf(owner, workspaceId, due)).toEqual(invoice);
    expect(await summaryOf(owner, workspaceId)).toMatchObject({
      state: 'past_due',
      access: 'full',
      dueInvoice: { id: due, status: 'pending', method: 'transfer' },
    });
    expect((await logOf(workspaceId)).at(-1)).toBe('transfer_started');

    const charge = vi.spyOn(fakeGateway(t), 'charge');
    const failedSince = await storedTime(workspaceId, 'failedSince');
    await runAt(after(failedSince, 2, 60_000));
    expect(charge).not.toHaveBeenCalled();

    const event = received(invoice);
    await postGatewayEvent(t, event).expect(200);
    expect(await summaryOf(owner, workspaceId)).toMatchObject({
      state: 'active',
      trialEndsAt: null,
      periodStart: trialEnd.toISOString(),
      periodEnd: periodEndOf(trialEnd, 'monthly').toISOString(),
      dueInvoice: null,
      failedSince: null,
    });
    const paid = invoiceSchema.parse(
      (await owner.get(endpoints.getInvoice.path(workspaceId, due)).expect(200)).body,
    );
    expect(paid).toMatchObject({ status: 'paid', method: 'transfer' });
    expect(
      t.emails.sent.filter(
        (sent) => sent.template === 'billing-receipt' && sent.to.includes(email),
      ),
    ).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({ method: 'Chuyển khoản' }) as unknown,
      }),
    ]);

    // The same event again is applied once; another transfer for it is refunded outside.
    await postGatewayEvent(t, event).expect(200);
    await postGatewayEvent(t, received(invoice)).expect(200);
    expect(
      await t.connection
        .collection('invoices')
        .countDocuments({ workspaceId: new Types.ObjectId(workspaceId), status: 'paid' }),
    ).toBe(1);
    expect(
      t.emails.sent.filter(
        (sent) => sent.template === 'billing-receipt' && sent.to.includes(email),
      ),
    ).toHaveLength(1);
  });

  it('is confirmed on the fake gateway’s page, once, which leads back to board 29', async () => {
    const { owner, workspaceId, due } = await refused();
    const invoice = await transferOf(owner, workspaceId, due);
    const page = new URL(invoice.transfer?.pageUrl ?? '');
    const path = `${page.pathname.replace(/^\/api/, '')}${page.search}`;
    const server = request(t.app.getHttpServer());

    const shown = await server.get(path).expect(200);
    expect(shown.headers['content-type']).toMatch(/text\/html/);
    expect(shown.text).toContain('Xác nhận đã nhận tiền');
    expect(shown.text).toContain(`PLP ${invoice.number}`);
    expect(shown.text).toContain('599.000 ₫');

    const session = page.searchParams.get('session') ?? '';
    const confirmed = await server
      .post('/public/billing/fake-gateway/transfer')
      .set('Origin', TEST_ADMIN_ORIGIN)
      .type('form')
      .send({ session })
      .expect(303);
    expect(confirmed.headers['location']).toBe(
      `${TEST_ADMIN_ORIGIN}/workspaces/${workspaceId}/billing/payments?transfer=received`,
    );
    expect(await summaryOf(owner, workspaceId)).toMatchObject({ state: 'active' });

    // Back on the page: it says so, and a second confirmation sends nothing.
    const again = await server.get(path).expect(200);
    expect(again.text).toContain('Đã xác nhận chuyển khoản');
    expect(again.text).not.toContain('Xác nhận đã nhận tiền');
    await server
      .post('/public/billing/fake-gateway/transfer')
      .set('Origin', TEST_ADMIN_ORIGIN)
      .type('form')
      .send({ session })
      .expect(409);
    await server.get('/public/billing/fake-gateway/transfer?session=forged').expect(400);
  });

  it('may be paid by card instead while it waits', async () => {
    const { owner, workspaceId, due } = await refused();
    await transferOf(owner, workspaceId, due);
    await addCard(t, owner, workspaceId, CARD_OK);
    const paid = await payInvoice(owner, workspaceId, due).expect(200);
    expect(invoiceSchema.parse((paid.body as { invoice: unknown }).invoice)).toMatchObject({
      status: 'paid',
      method: 'card',
      card: { last4: '4242' },
      transfer: null,
    });
    expect(await summaryOf(owner, workspaceId)).toMatchObject({ state: 'active' });
  });

  it('starts a paid plan by transfer: the trial goes on until it arrives', async () => {
    clock.set(START);
    const { client: owner, workspaceId } = await signedUpClient(t.app);
    clock.set(after(START, 3));
    const waiting = await owner
      .post(endpoints.changePlan.path(workspaceId), {
        planId: 'business',
        cycle: 'monthly',
        payNow: true,
        payWith: 'transfer',
        expectedAmount: 1_490_000,
      })
      .expect(202);
    const summary = billingSummarySchema.parse(waiting.body);
    expect(summary).toMatchObject({
      state: 'trialing',
      plan: { id: 'agency' },
      dueInvoice: { status: 'pending', method: 'transfer', amount: 1_490_000 },
    });
    const invoice = invoiceSchema.parse(
      (
        await owner
          .get(endpoints.getInvoice.path(workspaceId, summary.dueInvoice?.id ?? ''))
          .expect(200)
      ).body,
    );
    expect(invoice.transfer?.content).toBe(`PLP ${invoice.number}`);
    // Another plan paid now replaces the transfer that has not arrived.
    await addCard(t, owner, workspaceId, CARD_OK);
    clock.set(after(START, 4));
    await owner
      .post(endpoints.changePlan.path(workspaceId), {
        planId: 'agency',
        cycle: 'monthly',
        payNow: true,
        expectedAmount: 599_000,
      })
      .expect(200);
    const replaced = invoiceSchema.parse(
      (await owner.get(endpoints.getInvoice.path(workspaceId, invoice.id)).expect(200)).body,
    );
    expect(replaced.status).toBe('void');
    // A transfer that arrives for it after is not applied.
    await postGatewayEvent(t, received(invoice)).expect(200);
    expect(await summaryOf(owner, workspaceId)).toMatchObject({
      state: 'active',
      plan: { id: 'agency' },
      dueInvoice: null,
    });
  });

  it('starts the trial’s plan by transfer, its period from the transfer', async () => {
    clock.set(START);
    const { client: owner, workspaceId } = await signedUpClient(t.app);
    const waiting = billingSummarySchema.parse(
      (
        await owner
          .post(endpoints.changePlan.path(workspaceId), {
            planId: 'agency',
            cycle: 'yearly',
            payNow: true,
            payWith: 'transfer',
            expectedAmount: 5_990_000,
          })
          .expect(202)
      ).body,
    );
    const invoice = invoiceSchema.parse(
      (
        await owner
          .get(endpoints.getInvoice.path(workspaceId, waiting.dueInvoice?.id ?? ''))
          .expect(200)
      ).body,
    );
    clock.set(after(START, 2));
    await postGatewayEvent(t, received(invoice)).expect(200);
    const summary = await summaryOf(owner, workspaceId);
    expect(summary).toMatchObject({ state: 'active', cycle: 'yearly', trialEndsAt: null });
    expect(new Date(summary.periodStart).getTime()).toBeGreaterThanOrEqual(
      after(START, 2).getTime(),
    );
    expect((await logOf(workspaceId)).slice(-2)).toEqual(['transfer_started', 'paid_plan_started']);
  });

  it('is refused for an invoice that may have been charged, an upgrade, or a paid one', async () => {
    const { owner, workspaceId, due } = await refused();
    await addCard(t, owner, workspaceId, CARD_OK);
    await payInvoice(owner, workspaceId, due).expect(200);
    const paid = await startTransfer(owner, workspaceId, due).expect(409);
    expect(problemSchema.parse(paid.body).code).toBe('invoice_not_payable');

    clock.set(after(await storedTime(workspaceId, 'periodStart'), 10));
    vi.spyOn(fakeGateway(t), 'charge').mockRejectedValueOnce(new Error('socket hang up'));
    const unknown = await owner
      .post(endpoints.changePlan.path(workspaceId), {
        planId: 'business',
        cycle: 'monthly',
        expectedAmount: 594_000,
      })
      .expect(503);
    const upgradeId = String(problemSchema.parse(unknown.body).context?.['invoiceId']);
    const undecided = await startTransfer(owner, workspaceId, upgradeId).expect(409);
    expect(problemSchema.parse(undecided.body)).toMatchObject({
      code: 'payment_in_progress',
      context: { invoiceId: upgradeId },
    });
    // "Thanh toán lại" learns it went through; an upgrade is never paid by transfer either.
    await payInvoice(owner, workspaceId, upgradeId).expect(200);
    const upgrade = (await invoicesOf(owner, workspaceId)).items.find(
      (item) => item.id === upgradeId,
    );
    expect(upgrade?.kind).toBe('upgrade');
    const notTransferable = await startTransfer(owner, workspaceId, upgradeId).expect(409);
    expect(problemSchema.parse(notTransferable.body).code).toBe('invoice_not_payable');
  });

  it('is the owner’s alone, in a read-only workspace too; another workspace’s invoice is not found', async () => {
    const { owner, workspaceId, due, trialEnd } = await refused();
    await runAt(after(trialEnd, 9));
    expect(await summaryOf(owner, workspaceId)).toMatchObject({ access: 'read_only' });
    const admin = await addMember(t, workspaceId, 'admin');
    await startTransfer(admin.client, workspaceId, due).expect(403);
    const stranger = await signedUpClient(t.app);
    await startTransfer(stranger.client, workspaceId, due).expect(404);
    await startTransfer(stranger.client, stranger.workspaceId, due).expect(404);
    await transferOf(owner, workspaceId, due);
  });
});
